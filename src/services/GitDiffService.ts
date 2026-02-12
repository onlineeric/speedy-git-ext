import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { CommitDetails, FileChange, FileChangeStatus } from '../../shared/types.js';
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

    // Get file changes with stats
    const filesResult = await this.getDiffNameStatus(hash);
    if (!filesResult.success) {
      return filesResult;
    }

    // Get stats (additions/deletions) — use -z for correct rename path parsing
    const statsResult = await this.executor.execute({
      args: ['diff-tree', '--numstat', '-r', '--root', '-z', hash],
      cwd: this.workspacePath,
    });

    const stats = statsResult.success
      ? parseNumstat(statsResult.value.stdout, filesResult.value)
      : { additions: 0, deletions: 0 };

    return ok({
      ...meta,
      files: filesResult.value,
      stats,
    });
  }

  async getDiffNameStatus(hash: string): Promise<Result<FileChange[]>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    // --root handles initial commit (no parent)
    const result = await this.executor.execute({
      args: ['diff-tree', '--no-commit-id', '-r', '--name-status', '--root', '-z', hash],
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
    this.log.info('Getting uncommitted changes');
    // Staged changes
    const stagedResult = await this.executor.execute({
      args: ['diff', '--cached', '--name-status', '-z'],
      cwd: this.workspacePath,
    });

    // Unstaged changes
    const unstagedResult = await this.executor.execute({
      args: ['diff', '--name-status', '-z'],
      cwd: this.workspacePath,
    });

    // Untracked files
    const untrackedResult = await this.executor.execute({
      args: ['ls-files', '--others', '--exclude-standard', '-z'],
      cwd: this.workspacePath,
    });

    const files: FileChange[] = [];

    if (stagedResult.success) {
      files.push(...parseDiffNameStatus(stagedResult.value.stdout));
    }
    if (unstagedResult.success) {
      const unstaged = parseDiffNameStatus(unstagedResult.value.stdout);
      // Unstaged takes precedence over staged (represents current working tree state)
      const unstagedPaths = new Set(unstaged.map((f) => f.path));
      const merged = files.filter((f) => !unstagedPaths.has(f.path));
      merged.push(...unstaged);
      files.length = 0;
      files.push(...merged);
    }
    if (untrackedResult.success) {
      const untrackedPaths = untrackedResult.value.stdout
        .split(NULL_CHAR)
        .filter(Boolean);
      for (const path of untrackedPaths) {
        files.push({ path, status: 'untracked' });
      }
    }

    return ok(files);
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
function parseNumstat(output: string, files: FileChange[]): { additions: number; deletions: number } {
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

  const parts = output.split(NULL_CHAR);
  let i = 0;
  while (i < parts.length) {
    const statPart = parts[i];
    if (!statPart) { i++; continue; }

    const tabParts = statPart.split('\t');
    if (tabParts.length < 2) { i++; continue; }

    const addStr = tabParts[0];
    const delStr = tabParts[1];
    // Binary files show '-' for additions/deletions
    const additions = addStr === '-' ? 0 : parseInt(addStr, 10);
    const deletions = delStr === '-' ? 0 : parseInt(delStr, 10);

    // The file path follows as the next null-separated field(s)
    const filePath = parts[i + 1] ?? '';

    // For renames/copies, check if there's a second path
    const file = fileMap.get(filePath);
    if (file && (file.status === 'renamed' || file.status === 'copied')) {
      // Skip the extra path field for renames/copies
      i += 3;
    } else {
      i += 2;
    }

    totalAdditions += additions;
    totalDeletions += deletions;

    if (file) {
      file.additions = additions;
      file.deletions = deletions;
    }
  }

  return { additions: totalAdditions, deletions: totalDeletions };
}
