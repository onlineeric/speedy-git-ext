import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { CommitDetails, ConflictType, FileChange, FileChangeStatus, UncommittedSummary } from '../../shared/types.js';
import { validateHash, validateFilePath } from '../utils/gitValidation.js';

const NULL_CHAR = '\x00';

/** Format for git show: full commit metadata with %x00 (git's null-byte placeholder) as separators.
 *  We use %x00 instead of literal \x00 because Node.js spawn rejects args containing null bytes. */
const SHOW_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%b';

export class GitDiffService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getCommitDetails(hash: string): Promise<Result<CommitDetails>> {
    this.log.info(`Getting commit details for ${hash.slice(0, 7)}`);
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    // Get commit metadata
    const metaResult = await this.executor.execute({
      args: ['show', '--format=' + SHOW_FORMAT, '--no-patch', hash],
      cwd: this.workspacePath,
    });

    if (!metaResult.success) {
      return metaResult;
    }

    const meta = parseCommitMeta(metaResult.value.stdout.trim());
    if (!meta) {
      return err(new GitError('Failed to parse commit metadata', 'PARSE_ERROR'));
    }

    const isMerge = meta.parents.length > 1;

    // File changes and numstat are independent — run in parallel
    const numstatArgs = isMerge
      ? ['diff-tree', '--no-commit-id', '--numstat', '-r', '-z', `${hash}^1`, hash]
      : ['diff-tree', '--no-commit-id', '--numstat', '-r', '--root', '-z', hash];
    const [filesResult, statsResult] = await Promise.all([
      this.getDiffNameStatus(hash, isMerge),
      this.executor.execute({ args: numstatArgs, cwd: this.workspacePath }),
    ]);

    if (!filesResult.success) {
      return filesResult;
    }

    if (!statsResult.success) {
      this.log.warn(`Numstat command failed for ${hash.slice(0, 7)}: ${statsResult.error.message}`);
    }

    const stats = statsResult.success
      ? parseNumstat(statsResult.value.stdout, filesResult.value, this.log)
      : { additions: 0, deletions: 0 };

    return ok({
      ...meta,
      files: filesResult.value,
      stats,
    });
  }

  async getDiffNameStatus(hash: string, isMerge = false): Promise<Result<FileChange[]>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    // For merge commits, diff against first parent explicitly (hash^1..hash)
    // because diff-tree's default combined diff shows empty for clean merges.
    // For non-merge commits, --root handles the initial commit (no parent).
    const args = isMerge
      ? ['diff-tree', '--no-commit-id', '-r', '--name-status', '-z', `${hash}^1`, hash]
      : ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', '-z', hash];
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const files = parseDiffNameStatus(result.value.stdout);
    return ok(files);
  }

  async getCommitFile(hash: string, filePath: string): Promise<Result<string>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;
    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.success) return pathCheck;

    const result = await this.executor.execute({
      args: ['show', `${hash}:${filePath}`],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(result.value.stdout);
  }

  /** Returns the staged (index) version of a file, equivalent to `git show :<path>`. */
  async getStagedFileContent(filePath: string): Promise<Result<string>> {
    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.success) return pathCheck;

    const result = await this.executor.execute({
      args: ['show', `:${filePath}`],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(result.value.stdout);
  }

  async openExternalDirDiff(hash: string, parentHash?: string): Promise<Result<string>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;
    if (parentHash) {
      const parentCheck = validateHash(parentHash);
      if (!parentCheck.success) return parentCheck;
    }

    const parent = parentHash ?? `${hash}~1`;
    const result = await this.executor.execute({
      args: ['difftool', '--dir-diff', '--no-prompt', parent, hash],
      cwd: this.workspacePath,
      timeout: 60000,
    });

    if (!result.success) {
      return result;
    }

    return ok('External diff tool opened');
  }

  async getUncommittedDetails(): Promise<Result<FileChange[]>> {
    const summary = await this.getUncommittedSummary();
    if (!summary.success) return summary;
    return ok([...summary.value.stagedFiles, ...summary.value.unstagedFiles, ...summary.value.conflictFiles]);
  }

  async getUncommittedSummary(): Promise<Result<UncommittedSummary>> {
    this.log.info('Getting uncommitted changes summary');

    // Perf: single `git status --porcelain=v2` replaces 3 separate diff/ls-files commands,
    // numstat commands kept for per-file line counts, conflict detection runs in parallel
    const [statusResult, stagedNumstatResult, unstagedNumstatResult, conflictState] = await Promise.all([
      this.executor.execute({ args: ['status', '--porcelain=v2', '-z'], cwd: this.workspacePath }),
      this.executor.execute({ args: ['diff', '--cached', '--numstat', '-z'], cwd: this.workspacePath }),
      this.executor.execute({ args: ['diff', '--numstat', '-z'], cwd: this.workspacePath }),
      this.detectConflictState(),
    ]);

    const { stagedFiles, unstagedFiles, untrackedPaths } = statusResult.success
      ? parseStatusPorcelainV2(statusResult.value.stdout)
      : { stagedFiles: [] as FileChange[], unstagedFiles: [] as FileChange[], untrackedPaths: [] as string[] };

    if (stagedNumstatResult.success) {
      applyNumstatToFiles(stagedFiles, stagedNumstatResult.value.stdout);
    }
    if (unstagedNumstatResult.success) {
      applyNumstatToFiles(unstagedFiles, unstagedNumstatResult.value.stdout);
    }

    const taggedUntracked: FileChange[] = untrackedPaths.map((path): FileChange => ({
      path, status: 'untracked', stageState: 'unstaged',
    }));

    const conflictPathSet = new Set(conflictState.conflictFiles);
    const conflictFiles: FileChange[] = conflictState.conflictFiles.map((path): FileChange => ({
      path, status: 'modified', stageState: 'conflicted',
    }));

    const filteredStaged = conflictPathSet.size > 0
      ? stagedFiles.filter(f => !conflictPathSet.has(f.path))
      : stagedFiles;
    const filteredUnstaged = conflictPathSet.size > 0
      ? unstagedFiles.filter(f => !conflictPathSet.has(f.path))
      : unstagedFiles;

    return ok({
      stagedFiles: filteredStaged,
      unstagedFiles: [...filteredUnstaged, ...taggedUntracked],
      conflictFiles,
      conflictType: conflictState.conflictType,
      stagedCount: filteredStaged.length,
      unstagedCount: filteredUnstaged.length,
      untrackedCount: untrackedPaths.length,
    });
  }

  private async detectConflictState(): Promise<{ conflictType?: ConflictType; conflictFiles: string[] }> {
    // --verify --quiet exits non-zero when the ref doesn't exist, so .success is a reliable signal
    const [mergeHead, rebaseHead, cherryPickHead] = await Promise.all([
      this.executor.execute({ args: ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'], cwd: this.workspacePath }),
      this.executor.execute({ args: ['rev-parse', '--verify', '--quiet', 'REBASE_HEAD'], cwd: this.workspacePath }),
      this.executor.execute({ args: ['rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'], cwd: this.workspacePath }),
    ]);

    let conflictType: ConflictType | undefined;
    if (mergeHead.success) {
      conflictType = 'merge';
    } else if (rebaseHead.success) {
      conflictType = 'rebase';
    } else if (cherryPickHead.success) {
      conflictType = 'cherry-pick';
    }

    if (!conflictType) {
      return { conflictFiles: [] };
    }

    const conflictResult = await this.executor.execute({
      args: ['diff', '--name-only', '--diff-filter=U'],
      cwd: this.workspacePath,
    });

    const conflictFiles = conflictResult.success
      ? conflictResult.value.stdout.trim().split('\n').filter(Boolean)
      : [];

    return { conflictType, conflictFiles };
  }
}

function parseCommitMeta(output: string): Omit<CommitDetails, 'files' | 'stats'> | null {
  const parts = output.split(NULL_CHAR);
  if (parts.length < 11) {
    return null;
  }

  const [hash, abbreviatedHash, parentStr, author, authorEmail, authorDateStr,
    committer, committerEmail, committerDateStr, subject, ...bodyParts] = parts;

  return {
    hash,
    abbreviatedHash,
    parents: parentStr ? parentStr.split(' ').filter(Boolean) : [],
    author,
    authorEmail,
    authorDate: parseInt(authorDateStr, 10) * 1000,
    committer,
    committerEmail,
    committerDate: parseInt(committerDateStr, 10) * 1000,
    subject,
    body: bodyParts.join('\n').trim(),
  };
}

function parseDiffNameStatus(output: string): FileChange[] {
  if (!output.trim()) {
    return [];
  }

  const files: FileChange[] = [];
  const parts = output.split(NULL_CHAR).filter(Boolean);

  let i = 0;
  while (i < parts.length) {
    const statusCode = parts[i];
    if (!statusCode) break;

    const status = mapStatusCode(statusCode[0]);

    if (statusCode[0] === 'R' || statusCode[0] === 'C') {
      // Rename/Copy has two paths: old and new
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      if (oldPath && newPath) {
        files.push({ path: newPath, oldPath, status });
      }
      i += 3;
    } else {
      const path = parts[i + 1];
      if (path) {
        files.push({ path, status });
      }
      i += 2;
    }
  }

  return files;
}

function mapStatusCode(code: string): FileChangeStatus {
  switch (code) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'unknown';
  }
}

/**
 * Parses `git diff-tree --numstat -z` output.
 * With -z the format is: "adds\tdels\0path\0" for normal files,
 * and "adds\tdels\0oldpath\0newpath\0" for renames/copies.
 * The first entry is the commit hash line (no tabs), which we skip.
 */
function parseNumstat(
  output: string,
  files: FileChange[],
  log: import('vscode').LogOutputChannel
): { additions: number; deletions: number } {
  let totalAdditions = 0;
  let totalDeletions = 0;

  // Build lookup by both path and oldPath for renames
  const fileMap = new Map<string, FileChange>();
  for (const f of files) {
    fileMap.set(f.path, f);
    if (f.oldPath) {
      fileMap.set(f.oldPath, f);
    }
  }

  log.debug(`parseNumstat: output length=${output.length}, files count=${files.length}, fileMap keys=[${[...fileMap.keys()].join(', ')}]`);

  // With --numstat -z, the output format is:
  //   Non-rename: "additions\tdeletions\tpath\0"  (path is 3rd tab field)
  //   Rename:     "additions\tdeletions\t\0oldpath\0newpath\0" (empty 3rd tab field, paths as separate NUL fields)
  const parts = output.split(NULL_CHAR);
  let i = 0;
  while (i < parts.length) {
    const statPart = parts[i];
    if (!statPart) { i++; continue; }

    const tabParts = statPart.split('\t');
    if (tabParts.length < 2) { i++; continue; }

    const addStr = tabParts[0];
    const delStr = tabParts[1];
    const isBinary = addStr === '-' && delStr === '-';
    const additions = addStr === '-' ? 0 : parseInt(addStr, 10);
    const deletions = delStr === '-' ? 0 : parseInt(delStr, 10);

    // Determine file path based on format:
    // - Renames/copies: 3rd tab field is empty, old/new paths are next NUL-separated fields
    // - Regular files: 3rd tab field contains the path
    const thirdField = tabParts[2] ?? '';
    let filePath: string;
    if (thirdField === '' && parts[i + 1]) {
      // Rename/copy format: skip stat + oldpath + newpath
      filePath = parts[i + 1];
      i += 3;
    } else {
      // Regular file: path is in the 3rd tab field
      filePath = thirdField;
      i += 1;
    }

    totalAdditions += additions;
    totalDeletions += deletions;

    const file = fileMap.get(filePath);
    if (file) {
      if (!isBinary) {
        file.additions = additions;
        file.deletions = deletions;
      }
    } else {
      log.warn(`parseNumstat: no match for path "${filePath}" in fileMap`);
    }
  }

  return { additions: totalAdditions, deletions: totalDeletions };
}

/**
 * Applies per-file additions/deletions from `git diff --numstat -z` output
 * to an existing FileChange[] array (mutates in-place).
 * Format: "adds\tdels\tpath\0" for normal, "adds\tdels\t\0old\0new\0" for renames.
 */
function applyNumstatToFiles(files: FileChange[], numstatOutput: string): void {
  if (!numstatOutput) return;

  const fileMap = new Map<string, FileChange>();
  for (const f of files) {
    fileMap.set(f.path, f);
    if (f.oldPath) fileMap.set(f.oldPath, f);
  }

  const parts = numstatOutput.split(NULL_CHAR);
  let i = 0;
  while (i < parts.length) {
    const statPart = parts[i];
    if (!statPart) { i++; continue; }

    const tabParts = statPart.split('\t');
    if (tabParts.length < 2) { i++; continue; }

    const addStr = tabParts[0];
    const delStr = tabParts[1];
    const isBinary = addStr === '-' && delStr === '-';
    const additions = addStr === '-' ? 0 : parseInt(addStr, 10);
    const deletions = delStr === '-' ? 0 : parseInt(delStr, 10);

    const thirdField = tabParts[2] ?? '';
    let filePath: string;
    if (thirdField === '' && parts[i + 1]) {
      filePath = parts[i + 1];
      i += 3;
    } else {
      filePath = thirdField;
      i += 1;
    }

    const file = fileMap.get(filePath);
    if (file && !isBinary) {
      file.additions = additions;
      file.deletions = deletions;
    }
  }
}

/** Find the position right after the Nth space in a string. Returns -1 if not enough spaces. */
function afterNthSpace(str: string, n: number): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ' ') {
      count++;
      if (count === n) return i + 1;
    }
  }
  return -1;
}

function statusLetterToFileStatus(code: string): FileChangeStatus {
  switch (code) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'T': return 'modified'; // type change (e.g. file → symlink)
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'unknown';
  }
}

/**
 * Parses `git status --porcelain=v2 -z` output into staged, unstaged, and untracked files.
 *
 * Entry formats (NUL-terminated paths):
 *   1 XY sub mH mI mW hH hI <path>\0
 *   2 XY sub mH mI mW hH hI X<score> <path>\0<origPath>\0
 *   u XY sub m1 m2 m3 mW h1 h2 h3 <path>\0
 *   ? <path>\0
 */
function parseStatusPorcelainV2(output: string): {
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
  untrackedPaths: string[];
} {
  const stagedFiles: FileChange[] = [];
  const unstagedFiles: FileChange[] = [];
  const untrackedPaths: string[] = [];

  if (!output.trim()) {
    return { stagedFiles, unstagedFiles, untrackedPaths };
  }

  const tokens = output.split(NULL_CHAR).filter(Boolean);
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith('1 ')) {
      // Ordinary changed entry — 8 header fields before path
      const xy = token.substring(2, 4);
      const path = token.substring(afterNthSpace(token, 8));
      if (xy[0] !== '.') {
        stagedFiles.push({ path, status: statusLetterToFileStatus(xy[0]), stageState: 'staged' });
      }
      if (xy[1] !== '.') {
        unstagedFiles.push({ path, status: statusLetterToFileStatus(xy[1]), stageState: 'unstaged' });
      }
    } else if (token.startsWith('2 ')) {
      // Rename/copy entry — 9 header fields before path, next token is origPath
      const xy = token.substring(2, 4);
      const path = token.substring(afterNthSpace(token, 9));
      const origPath = tokens[i + 1] ?? '';
      i++; // consume origPath token
      if (xy[0] !== '.') {
        stagedFiles.push({ path, oldPath: origPath, status: xy[0] === 'R' ? 'renamed' : 'copied', stageState: 'staged' });
      }
      if (xy[1] !== '.') {
        unstagedFiles.push({ path, oldPath: origPath, status: xy[1] === 'R' ? 'renamed' : 'copied', stageState: 'unstaged' });
      }
    } else if (token.startsWith('u ')) {
      // Unmerged entries are handled separately via detectConflictState — skip here
    } else if (token.startsWith('? ')) {
      untrackedPaths.push(token.substring(2));
    }

    i++;
  }

  return { stagedFiles, unstagedFiles, untrackedPaths };
}
