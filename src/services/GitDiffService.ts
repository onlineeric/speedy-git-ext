import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { CommitDetails, CompareMode, CompareResult, ConflictType, FileChange, FileChangeStatus, FileStageState, SlotValue, UncommittedSummary } from '../../shared/types.js';
import { EMPTY_TREE_HASH } from '../../shared/types.js';
import { validateHash, validateFilePath } from '../utils/gitValidation.js';

const NULL_CHAR = '\x00';

/**
 * Tree entry mode for a gitlink — a submodule pointer rather than a blob.
 *
 * Git reports a changed submodule as an ordinary changed path, so the mode is the
 * only thing in its output that tells the two apart. That matters because a gitlink
 * names a commit in the *submodule's* object database: this repo can resolve the
 * path to a hash but has no object behind it, so every content read fails.
 */
const SUBMODULE_MODE = '160000';

/** What git appends to a submodule pointer whose checkout has uncommitted tracked changes. */
const SUBMODULE_DIRTY_SUFFIX = '-dirty';

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
      this.getDiffFileChanges(hash, isMerge),
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

  async getDiffFileChanges(hash: string, isMerge = false): Promise<Result<FileChange[]>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    // For merge commits, diff against first parent explicitly (hash^1..hash)
    // because diff-tree's default combined diff shows empty for clean merges.
    // For non-merge commits, --root handles the initial commit (no parent).
    const args = isMerge
      ? ['diff-tree', '--no-commit-id', '-r', '--raw', '-z', `${hash}^1`, hash]
      : ['diff-tree', '--no-commit-id', '-r', '--raw', '--root', '-z', hash];
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const files = parseDiffRaw(result.value.stdout);
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

    if (result.success) {
      return ok(result.value.stdout);
    }

    // `git show <rev>:<path>` fails for a submodule at *every* revision: the path
    // resolves fine, but the hash it resolves to is a commit in the submodule's own
    // object database, so this repo reports "bad object". There is no content here to
    // read — the pointer line is the whole of what the parent repo recorded.
    //
    // Reached on any read failure, not only a gitlink: an added file's parent side and a
    // deleted file's child side fail too, and each pays one `ls-tree` that answers null.
    // That is one spawn on a path that was already returning an error, never on a
    // successful read, so no diff that renders content is slowed by it.
    const pointer = await this.readSubmodulePointerAt(hash, filePath);
    if (pointer !== null) {
      return ok(formatSubmodulePointer(pointer));
    }

    return result;
  }

  /** Returns the staged (index) version of a file, equivalent to `git show :<path>`. */
  async getStagedFileContent(filePath: string): Promise<Result<string>> {
    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.success) return pathCheck;

    const result = await this.executor.execute({
      args: ['show', `:${filePath}`],
      cwd: this.workspacePath,
    });

    if (result.success) {
      return ok(result.value.stdout);
    }

    // Same gitlink problem as `getCommitFile`, one level down: the index stores the
    // submodule as a mode-160000 entry, which `git show :<path>` cannot render either.
    const pointer = await this.readStagedSubmodulePointer(filePath);
    if (pointer !== null) {
      return ok(formatSubmodulePointer(pointer));
    }

    return result;
  }

  /**
   * The working-tree side of a submodule diff: the pointer line for the commit the
   * submodule's own checkout currently sits on, carrying git's own `-dirty` suffix when
   * that checkout has uncommitted work in it.
   *
   * The suffix is not decoration: a submodule can be listed as changed *without* its
   * pointer moving, and without it both sides of the diff would read the same hash — the
   * blank-looking diff this whole path exists to stop showing.
   *
   * Empty string when there is nothing to show — the path is not a submodule, or is one
   * that was never initialized, so no commit is checked out to point at.
   */
  async getWorkingTreeSubmoduleContent(filePath: string): Promise<Result<string>> {
    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.success) return pathCheck;

    const result = await this.executor.execute({
      args: ['submodule', 'status', '--', filePath],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const pointer = parseSubmoduleStatusPointer(result.value.stdout);
    if (pointer === null) return ok('');

    const isDirty = await this.isSubmoduleCheckoutDirty(filePath);
    return ok(formatSubmodulePointer(isDirty ? `${pointer}${SUBMODULE_DIRTY_SUFFIX}` : pointer));
  }

  /**
   * Whether the submodule's own checkout has modified tracked content — exactly what git
   * turns into the `-dirty` suffix.
   *
   * Asked of the *parent's* status rather than `git -C <path> status`, for the same reason
   * the pointer comes from `git submodule status`: an uninitialized submodule is an empty
   * directory, so a command run inside it walks up and answers for the parent repo.
   */
  private async isSubmoduleCheckoutDirty(filePath: string): Promise<boolean> {
    const result = await this.executor.execute({
      args: ['status', '--porcelain=v2', '-z', '--', filePath],
      cwd: this.workspacePath,
    });

    if (!result.success) return false;
    return hasModifiedSubmoduleContent(result.value.stdout);
  }

  /** The commit a submodule points at in `rev`'s tree, or `null` if that path is not a gitlink there. */
  private async readSubmodulePointerAt(rev: string, filePath: string): Promise<string | null> {
    const result = await this.executor.execute({
      args: ['ls-tree', '--end-of-options', rev, '--', filePath],
      cwd: this.workspacePath,
    });

    if (!result.success) return null;
    return parseLsTreeGitlink(result.value.stdout);
  }

  /** The commit a submodule points at in the index, or `null` if that path is not a gitlink there. */
  private async readStagedSubmodulePointer(filePath: string): Promise<string | null> {
    const result = await this.executor.execute({
      args: ['ls-files', '-s', '--', filePath],
      cwd: this.workspacePath,
    });

    if (!result.success) return null;
    return parseLsFilesGitlink(result.value.stdout);
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
    // numstat commands kept for per-file line counts, conflict detection runs in parallel.
    // `--ignore-submodules=dirty` keeps parent-level gitlink changes visible while avoiding
    // a status walk inside every submodule on large parent repos.
    const [statusResult, stagedNumstatResult, unstagedNumstatResult, conflictState] = await Promise.all([
      this.executor.execute({ args: ['status', '--porcelain=v2', '-z', '--ignore-submodules=dirty'], cwd: this.workspacePath }),
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

  /**
   * Compare two refs (042-compare-refs). Each slot is mapped to a commit-ish
   * string by `resolveSlotValue`; branches/tags/expressions are passed verbatim
   * to git for native resolution (FR-007a — lazy resolve). Working-tree side is
   * encoded as `null` and produces the `git diff <refA>` form.
   *
   * For three-dot mode, runs `git merge-base` first; if no common ancestor
   * exists, falls back to two-dot and sets `fellBackToTwoDot: true` (FR-012).
   *
   * `abortSignal` is plumbed into every spawned `git` process so a single
   * cancel aborts all parallel sub-commands (FR-025b).
   */
  async compareRefs(
    a: SlotValue,
    b: SlotValue,
    mode: CompareMode,
    abortSignal?: AbortSignal,
  ): Promise<Result<CompareResult, GitError>> {
    const refA = resolveSlotValue(a);
    const refB = resolveSlotValue(b);

    if (refA === null && refB === null) {
      return err(new GitError('Both slots are Working Tree; nothing to compare', 'VALIDATION_ERROR'));
    }
    // FR-011: three-dot requires both sides resolve to a ref (Working Tree forbidden in either slot).
    if (mode === 'three-dot' && (refA === null || refB === null)) {
      return err(new GitError('three-dot is not supported with Working Tree', 'VALIDATION_ERROR'));
    }
    // Reject expressions that begin with `-` so they cannot be parsed as git options.
    // `--end-of-options` below is the deeper defense, but rejecting early gives a clearer error.
    if ((a.kind === 'expression' && a.text.trim().startsWith('-')) ||
        (b.kind === 'expression' && b.text.trim().startsWith('-'))) {
      return err(new GitError('Expression must not start with "-"', 'VALIDATION_ERROR'));
    }

    let effectiveMode: CompareMode = mode;
    let fellBackToTwoDot = false;

    if (mode === 'three-dot' && refA !== null && refB !== null) {
      const mergeBase = await this.executor.execute({
        args: ['merge-base', '--end-of-options', refA, refB],
        cwd: this.workspacePath,
        abortSignal,
      });
      if (!mergeBase.success) {
        if (mergeBase.error.code === 'CANCELLED') return mergeBase;
        // No common ancestor — fall back to two-dot per FR-012
        effectiveMode = 'two-dot';
        fellBackToTwoDot = true;
      }
    }

    // FR-018: Working Tree may appear in slot A. `git diff <ref>` compares working tree to <ref>
    // with output direction "<ref> → working tree". To honor user intent (Base=WT, Target=ref →
    // changes from WT to ref), invert with `-R` when refA is null.
    const buildArgs = (extra: string[]): string[] => {
      const base = ['diff', ...extra, '-z'];
      if (refA === null && refB !== null) {
        return [...base, '-R', '--end-of-options', refB];
      }
      if (refB === null && refA !== null) {
        return [...base, '--end-of-options', refA];
      }
      // Both refs present (refA !== null && refB !== null).
      if (effectiveMode === 'three-dot') {
        return [...base, '--end-of-options', `${refA!}...${refB!}`];
      }
      return [...base, '--end-of-options', refA!, refB!];
    };

    const [namesResult, statsResult] = await Promise.all([
      this.executor.execute({ args: buildArgs(['--raw']), cwd: this.workspacePath, abortSignal }),
      this.executor.execute({ args: buildArgs(['--numstat']), cwd: this.workspacePath, abortSignal }),
    ]);

    if (!namesResult.success) {
      return err(this.translateCompareError(namesResult.error, a, b));
    }
    if (!statsResult.success) {
      this.log.warn(`numstat failed for compare; continuing without per-file counts: ${statsResult.error.message}`);
    }

    const files = parseDiffRaw(namesResult.value.stdout);
    let totalAdditions = 0;
    let totalDeletions = 0;
    if (statsResult.success) {
      const stats = applyNumstatToFilesWithTotals(files, statsResult.value.stdout);
      totalAdditions = stats.additions;
      totalDeletions = stats.deletions;
    }

    // Resolve the final hashes for the FR-026 graph markers. Working-tree side → null,
    // emptyTree → EMPTY_TREE_HASH directly. Other kinds resolved via rev-parse.
    const aResolvedHash = await this.resolveHashForMarker(a, abortSignal);
    const bResolvedHash = b.kind === 'workingTree' ? null : await this.resolveHashForMarker(b, abortSignal);

    return ok({
      a, b, mode: effectiveMode, fellBackToTwoDot,
      aResolvedHash, bResolvedHash,
      files,
      stats: { additions: totalAdditions, deletions: totalDeletions },
    });
  }

  private async resolveHashForMarker(slot: SlotValue, abortSignal?: AbortSignal): Promise<string | null> {
    if (slot.kind === 'workingTree') return null;
    if (slot.kind === 'emptyTree') return EMPTY_TREE_HASH;

    // FR-004: commit slots may carry a short hash; canonicalise via rev-parse so the
    // returned value can be matched directly against the graph row's full 40-char hash.
    const ref = resolveSlotValue(slot);
    if (ref === null) return null;

    // `--verify` ensures rev-parse outputs only the resolved object (no echoed args);
    // `--end-of-options` keeps the ref safe even if a future caller passes a leading `-`.
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', '--end-of-options', ref],
      cwd: this.workspacePath,
      abortSignal,
    });
    if (!result.success) return null;
    return result.value.stdout.trim() || null;
  }

  private translateCompareError(error: GitError, a: SlotValue, b: SlotValue): GitError {
    if (error.code === 'CANCELLED') return error;
    const stderr = error.stderr ?? error.message;
    if (/unknown revision|ambiguous argument|bad revision/i.test(stderr)) {
      // Identify which side failed when possible — git typically names the ref in stderr.
      const aLabel = slotLabelForError(a);
      const bLabel = slotLabelForError(b);
      const failedLabel = stderr.includes(aLabel) ? aLabel : stderr.includes(bLabel) ? bLabel : `${aLabel} or ${bLabel}`;
      return new GitError(`Unknown ref: ${failedLabel}`, 'COMMAND_FAILED', error.command, stderr);
    }
    return error;
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

/**
 * Parses `git diff --raw -z` / `git diff-tree --raw -z` output.
 *
 * Each entry is one metadata token followed by one path (two for renames/copies):
 *
 *   :<srcmode> <dstmode> <srcsha> <dstsha> <status>\0<path>\0
 *
 * `--raw` rather than `--name-status` purely for the modes — they are what identifies a
 * submodule (see {@link SUBMODULE_MODE}), and `--name-status` reports one identically to
 * an edited file. The two shas are deliberately ignored: `git diff` abbreviates them and
 * `git diff-tree` does not, and the working-tree side is all zeroes, so no caller can
 * treat them as a usable commit id. Pointers are resolved on demand instead.
 */
function parseDiffRaw(output: string): FileChange[] {
  if (!output.trim()) {
    return [];
  }

  const files: FileChange[] = [];
  const parts = output.split(NULL_CHAR).filter(Boolean);

  let i = 0;
  while (i < parts.length) {
    const meta = parts[i];
    if (!meta || !meta.startsWith(':')) break;

    // Header fields are single-space separated and never contain spaces themselves,
    // so positional indexing is safe; the path arrives as its own NUL-delimited token.
    const fields = meta.slice(1).split(' ');
    const srcMode = fields[0];
    const dstMode = fields[1];
    const statusCode = fields[4];
    if (!statusCode) break;

    const status = mapStatusCode(statusCode[0]);
    // Either side is enough: an added submodule has no src mode, a removed one no dst.
    const isSubmodule = srcMode === SUBMODULE_MODE || dstMode === SUBMODULE_MODE;

    if (statusCode[0] === 'R' || statusCode[0] === 'C') {
      // Rename/Copy has two paths: old and new
      const oldPath = parts[i + 1];
      const newPath = parts[i + 2];
      if (oldPath && newPath) {
        files.push(buildFileChange(newPath, status, isSubmodule, oldPath));
      }
      i += 3;
    } else {
      const path = parts[i + 1];
      if (path) {
        files.push(buildFileChange(path, status, isSubmodule));
      }
      i += 2;
    }
  }

  return files;
}

/**
 * The single line git itself renders for a gitlink, so the diff editor shows exactly the
 * `-Subproject commit <old>` / `+Subproject commit <new>` pair `git diff` prints. The two
 * sides are plain text to the editor; it derives the +/- itself.
 */
function formatSubmodulePointer(commitHash: string): string {
  return `Subproject commit ${commitHash}\n`;
}

/** Reads the gitlink hash out of a `git ls-tree` line (`160000 commit <sha>\t<path>`). */
function parseLsTreeGitlink(output: string): string | null {
  const [meta] = (output.split('\n')[0] ?? '').split('\t');
  const [mode, type, hash] = (meta ?? '').trim().split(/ +/);
  if (mode !== SUBMODULE_MODE || type !== 'commit' || !hash) return null;
  return hash;
}

/** Reads the gitlink hash out of a `git ls-files -s` line (`160000 <sha> 0\t<path>`). */
function parseLsFilesGitlink(output: string): string | null {
  const [meta] = (output.split('\n')[0] ?? '').split('\t');
  const [mode, hash] = (meta ?? '').trim().split(/ +/);
  if (mode !== SUBMODULE_MODE || !hash) return null;
  return hash;
}

/**
 * Reads the checked-out commit out of `git submodule status` (`[ +-U]<sha> <path> (<ref>)`).
 *
 * The leading flag is the point of using this over `git -C <path> rev-parse HEAD`: an
 * uninitialized submodule is just an empty directory, so rev-parse there walks up and
 * cheerfully answers with the *parent* repo's HEAD. '-' marks that case, and we return
 * null rather than a hash belonging to the wrong repository.
 *
 * 'U' — the submodule is in a merge conflict — is refused for a related reason: git prints
 * an all-zero sha there rather than a commit, and rendering `Subproject commit 0000…` would
 * be a hash that names nothing at all.
 */
function parseSubmoduleStatusPointer(output: string): string | null {
  const line = output.split('\n')[0];
  if (!line) return null;

  const flag = line[0];
  if (flag === '-' || flag === 'U') return null;

  const hash = (flag === ' ' || flag === '+' ? line.slice(1) : line).trim().split(/ +/)[0];
  return hash ? hash : null;
}

/**
 * Whether a `git status --porcelain=v2 -z` run reports modified tracked content inside a
 * submodule — the one flag git renders as the pointer's `-dirty` suffix.
 *
 * Field 3 of a '1'/'2' entry is 'S<c><m><u>' for a submodule (see
 * {@link isSubmoduleStatusEntry}); the 'm' slot is tracked modifications. Untracked-only
 * content sets 'u' instead, and git does not call that dirty here, so neither do we.
 */
function hasModifiedSubmoduleContent(output: string): boolean {
  return output.split(NULL_CHAR).some((token) => {
    // Only '1'/'2' entries carry the field; the other tokens include bare paths, which
    // could otherwise have a third space-separated word that happens to start with 'S'.
    if (!token.startsWith('1 ') && !token.startsWith('2 ')) return false;
    return isSubmoduleStatusEntry(token) && token.split(' ')[2]?.[2] === 'M';
  });
}

/** Builds a `FileChange`, leaving `isSubmodule` off entirely unless it is true. */
function buildFileChange(
  path: string,
  status: FileChangeStatus,
  isSubmodule: boolean,
  oldPath?: string
): FileChange {
  const file: FileChange = { path, status };
  if (oldPath !== undefined) file.oldPath = oldPath;
  if (isSubmodule) file.isSubmodule = true;
  return file;
}

/** Attaches a stage state to a `FileChange` built by {@link buildFileChange}. */
function withStageState(file: FileChange, stageState: FileStageState): FileChange {
  file.stageState = stageState;
  return file;
}

/**
 * Whether a `git status --porcelain=v2` entry describes a submodule.
 *
 * Field 3 of every '1'/'2' entry is the submodule field: 'N...' for anything else,
 * 'S<c><m><u>' for a submodule. Positional because the header fields are single-space
 * separated and space-free — only the trailing path can contain spaces.
 */
function isSubmoduleStatusEntry(token: string): boolean {
  return token.split(' ')[2]?.startsWith('S') ?? false;
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
 * Map a `SlotValue` to a commit-ish string suitable for `git diff` arguments.
 * Branches/tags/expressions are passed verbatim — git resolves them natively
 * (FR-007a, lazy resolve). Working-tree returns `null` (handled by caller).
 *
 * 042-compare-refs.
 */
function resolveSlotValue(slot: SlotValue): string | null {
  switch (slot.kind) {
    case 'workingTree': return null;
    case 'head': return 'HEAD';
    case 'branch': return slot.remote ? `${slot.remote}/${slot.name}` : slot.name;
    case 'tag': return slot.name;
    case 'commit': return slot.hash;
    case 'expression': return slot.text;
    case 'emptyTree': return EMPTY_TREE_HASH;
  }
}

/** Human-readable label used in compare error messages. Must match webview's
 *  `slotLabel` so the user-visible identifier is consistent across surfaces. */
function slotLabelForError(slot: SlotValue): string {
  switch (slot.kind) {
    case 'workingTree': return 'Working Tree';
    case 'head': return 'HEAD';
    case 'branch': return slot.remote ? `${slot.remote}/${slot.name}` : slot.name;
    case 'tag': return slot.name;
    case 'commit': return slot.hash.slice(0, 7);
    case 'expression': return slot.text;
    case 'emptyTree': return 'Empty Tree';
  }
}

/** Variant of `applyNumstatToFiles` that also returns aggregate totals.
 *  Used by `compareRefs` so the result's `stats` field is populated. */
function applyNumstatToFilesWithTotals(files: FileChange[], numstatOutput: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  if (!numstatOutput) return { additions, deletions };

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
    const fileAdditions = addStr === '-' ? 0 : parseInt(addStr, 10);
    const fileDeletions = delStr === '-' ? 0 : parseInt(delStr, 10);

    const thirdField = tabParts[2] ?? '';
    let filePath: string;
    if (thirdField === '' && parts[i + 1]) {
      filePath = parts[i + 1];
      i += 3;
    } else {
      filePath = thirdField;
      i += 1;
    }

    if (!isBinary) {
      additions += fileAdditions;
      deletions += fileDeletions;
    }

    const file = fileMap.get(filePath);
    if (file && !isBinary) {
      file.additions = fileAdditions;
      file.deletions = fileDeletions;
    }
  }

  return { additions, deletions };
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
      const isSubmodule = isSubmoduleStatusEntry(token);
      if (xy[0] !== '.') {
        stagedFiles.push(withStageState(buildFileChange(path, statusLetterToFileStatus(xy[0]), isSubmodule), 'staged'));
      }
      if (xy[1] !== '.') {
        unstagedFiles.push(withStageState(buildFileChange(path, statusLetterToFileStatus(xy[1]), isSubmodule), 'unstaged'));
      }
    } else if (token.startsWith('2 ')) {
      // Rename/copy entry — 9 header fields before path, next token is origPath
      const xy = token.substring(2, 4);
      const path = token.substring(afterNthSpace(token, 9));
      const origPath = tokens[i + 1] ?? '';
      const isSubmodule = isSubmoduleStatusEntry(token);
      i++; // consume origPath token
      if (xy[0] !== '.') {
        stagedFiles.push(withStageState(buildFileChange(path, xy[0] === 'R' ? 'renamed' : 'copied', isSubmodule, origPath), 'staged'));
      }
      if (xy[1] !== '.') {
        unstagedFiles.push(withStageState(buildFileChange(path, statusLetterToFileStatus(xy[1]), isSubmodule, origPath), 'unstaged'));
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
