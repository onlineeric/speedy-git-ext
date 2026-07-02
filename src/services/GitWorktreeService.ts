import { existsSync } from 'node:fs';
import { readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { WorktreeInfo, WorktreeBranchMode } from '../../shared/types.js';
import { isDirtyWorkingTree } from '../utils/gitQueries.js';
import { validateLocalBranchName, validateRefName, validateWorktreePath } from '../utils/gitValidation.js';
import { mapWorktreeConflictError } from '../utils/worktreeErrors.js';

export interface AddWorktreeOptions {
  path: string;
  ref: string;
  branchMode: WorktreeBranchMode;
  newBranchName?: string;
  force?: boolean;
}

export interface ResolveWorktreePathOptions {
  ref: string;
  branchMode: WorktreeBranchMode;
  newBranchName?: string;
}

/** Normalize a path for cross-worktree comparison (resolve, drop trailing separator). */
function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  // On case-insensitive platforms, compare case-insensitively.
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function looksLikeSubmoduleGitDir(p: string): boolean {
  return p.replace(/\\/g, '/').includes('/.git/modules/');
}

/**
 * Recognize local env files: `.env` itself or any `.env.<suffix>` (e.g. `.env.local`,
 * `.env.production`). Deliberately excludes unrelated dotfiles like `.environment`.
 */
function isEnvFileName(name: string): boolean {
  return name === '.env' || name.startsWith('.env.');
}

/** Split git stdout into trimmed, non-empty lines. */
function splitNonEmptyLines(stdout: string): string[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Sanitize a ref/branch name into a filesystem-safe leaf folder name.
 * Replaces path separators and unsafe characters with '-', collapses repeats,
 * and trims leading/trailing separators.
 */
function sanitizeLeafName(ref: string): string {
  const cleaned = ref
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned || 'worktree';
}

async function resolveDetachedLeafName(
  executor: GitExecutor,
  cwd: string,
  ref: string
): Promise<Result<string>> {
  const result = await executor.execute({
    args: ['rev-parse', '--short=10', '--verify', `${ref}^{commit}`],
    cwd,
  });
  if (!result.success) return result;
  return ok(result.value.stdout.trim());
}

/**
 * Detect git's "branch already checked out elsewhere" refusal and rewrite it as
 * a readable message naming the conflicting worktree (FR-024 / T042).
 */
function mapAddWorktreeError(error: GitError): GitError {
  return mapWorktreeConflictError(
    error,
    (conflictingPath) =>
      `That branch is already checked out in another worktree at "${conflictingPath}". Create a new branch instead, or remove that worktree first.`
  );
}

async function resolveCurrentWorktreePath(
  executor: GitExecutor,
  cwd: string,
  reportedGitDir: string
): Promise<string> {
  const worktreeConfig = await executor.execute({
    args: ['config', '--path', '--get', 'core.worktree'],
    cwd,
  });
  if (worktreeConfig.success) {
    const configuredPath = worktreeConfig.value.stdout.trim();
    if (configuredPath) {
      return path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(reportedGitDir, configuredPath);
    }
  }

  const result = await executor.execute({
    args: ['rev-parse', '--show-toplevel'],
    cwd,
  });
  if (!result.success) return cwd;

  const topLevel = result.value.stdout.trim();
  return topLevel.length > 0 ? topLevel : cwd;
}

async function resolveCurrentWorktreeBranch(
  executor: GitExecutor,
  cwd: string
): Promise<string> {
  const result = await executor.execute({
    args: ['for-each-ref', '--format=%(refname)', 'refs/heads', '--points-at', 'HEAD'],
    cwd,
  });
  if (!result.success) return '';

  const branches = splitNonEmptyLines(result.value.stdout);

  return branches.find((branchName) => branchName !== 'refs/heads/main') ?? branches[0] ?? '';
}

export class GitWorktreeService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async listWorktrees(): Promise<Result<WorktreeInfo[]>> {
    this.log.info('List worktrees');
    const result = await this.executor.execute({
      args: ['worktree', 'list', '--porcelain'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      this.log.warn(`git worktree list failed, returning empty: ${result.error.message}`);
      return ok([]);
    }

    const stdout = result.value.stdout.trim();
    if (!stdout) return ok([]);

    const currentPath = normalizePath(this.workspacePath);
    const worktrees: WorktreeInfo[] = [];
    const blocks = stdout.split('\n\n');
    let isFirst = true;
    let resolvedCurrentWorktreePath: string | undefined;
    let resolvedCurrentWorktreeBranch: string | undefined;

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      let worktreePath = '';
      let head = '';
      let branch = '';
      let isDetached = false;
      let isPrunable = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktreePath = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length);
        } else if (line === 'detached') {
          isDetached = true;
        } else if (line === 'prunable' || line.startsWith('prunable ')) {
          isPrunable = true;
        }
      }

      if (worktreePath && head) {
        if (isFirst && looksLikeSubmoduleGitDir(worktreePath)) {
          resolvedCurrentWorktreePath ??= await resolveCurrentWorktreePath(
            this.executor,
            this.workspacePath,
            worktreePath
          );
          worktreePath = resolvedCurrentWorktreePath;

          if (isDetached || !branch) {
            resolvedCurrentWorktreeBranch ??= await resolveCurrentWorktreeBranch(
              this.executor,
              resolvedCurrentWorktreePath
            );
            if (resolvedCurrentWorktreeBranch) {
              branch = resolvedCurrentWorktreeBranch;
              isDetached = false;
            }
          }
        }

        worktrees.push({
          path: worktreePath,
          head,
          branch,
          isMain: isFirst,
          isDetached,
          isCurrent: normalizePath(worktreePath) === currentPath,
          isPrunable,
        });
      }

      isFirst = false;
    }

    return ok(worktrees);
  }

  /**
   * Compose the absolute target path for a new worktree (research R1/R2):
   * read the configured base path, expand `${repoName}` and resolve any leading
   * `..` anchored to the MAIN worktree (never the current one), sanitize the ref
   * to a leaf folder name, and append a numeric suffix on collision.
   */
  async resolveWorktreePath(
    opts: ResolveWorktreePathOptions,
    basePath: string
  ): Promise<Result<{ path: string; leafName: string }>> {
    const listResult = await this.listWorktrees();
    if (!listResult.success) return listResult;

    const main = listResult.value.find((w) => w.isMain);
    const mainPath = main ? main.path : this.workspacePath;
    const repoName = path.basename(mainPath);

    const expandedBase = basePath.replace(/\$\{repoName\}/g, repoName);
    // Anchor relative base paths (including a leading `..`) to the main worktree.
    const baseDir = path.resolve(mainPath, expandedBase);

    let desiredLeaf: string;
    if (opts.branchMode === 'new' && opts.newBranchName) {
      desiredLeaf = opts.newBranchName;
    } else if (opts.branchMode === 'detached') {
      const detachedLeaf = await resolveDetachedLeafName(this.executor, this.workspacePath, opts.ref);
      if (!detachedLeaf.success) return detachedLeaf;
      desiredLeaf = detachedLeaf.value;
    } else {
      desiredLeaf = opts.ref;
    }
    const leaf = sanitizeLeafName(desiredLeaf);

    const existingPaths = new Set(listResult.value.map((w) => normalizePath(w.path)));
    const collides = (candidate: string): boolean =>
      existingPaths.has(normalizePath(candidate)) || existsSync(candidate);

    let finalLeaf = leaf;
    let candidate = path.join(baseDir, finalLeaf);
    let suffix = 2;
    while (collides(candidate)) {
      finalLeaf = `${leaf}-${suffix}`;
      candidate = path.join(baseDir, finalLeaf);
      suffix += 1;
    }

    return ok({ path: candidate, leafName: finalLeaf });
  }

  async addWorktree(opts: AddWorktreeOptions): Promise<Result<void>> {
    this.log.info(`Add worktree at ${opts.path} (${opts.branchMode}) from ${opts.ref}`);

    const pathCheck = validateWorktreePath(opts.path);
    if (!pathCheck.success) return pathCheck;
    const refCheck = validateRefName(opts.ref);
    if (!refCheck.success) return refCheck;

    const args = ['worktree', 'add'];
    if (opts.force) args.push('--force');

    if (opts.branchMode === 'new') {
      const name = opts.newBranchName ?? '';
      const nameCheck = validateLocalBranchName(name);
      if (!nameCheck.success) return nameCheck;
      args.push('-b', nameCheck.value, pathCheck.value, opts.ref);
    } else if (opts.branchMode === 'detached') {
      args.push('--detach', pathCheck.value, opts.ref);
    } else {
      args.push(pathCheck.value, opts.ref);
    }

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) {
      return err(mapAddWorktreeError(result.error));
    }
    return ok(undefined);
  }

  /**
   * Detect local `.env*` files in the current worktree that git ignores — the ones
   * `git worktree add` would NOT carry over (untracked) and a user typically copies by
   * hand. Uses `git check-ignore` (robust against patterns, negations, nested `.gitignore`
   * files, and the global excludes file) rather than parsing `.gitignore` text.
   *
   * `envFilesPresent` distinguishes "no `.env*` files at all" from "they exist but none
   * are ignored", so the dialog can show an accurate disabled-checkbox hint.
   */
  async detectCopyableEnvFiles(): Promise<Result<{ ignoredEnvFiles: string[]; envFilesPresent: boolean }>> {
    let envFiles: string[];
    try {
      const entries = await readdir(this.workspacePath, { withFileTypes: true });
      envFiles = entries.filter((e) => e.isFile() && isEnvFileName(e.name)).map((e) => e.name);
    } catch (error) {
      this.log.warn(`Failed to read directory for env-file detection: ${(error as Error).message}`);
      return ok({ ignoredEnvFiles: [], envFilesPresent: false });
    }

    if (envFiles.length === 0) return ok({ ignoredEnvFiles: [], envFilesPresent: false });

    // `git check-ignore` exits 0 and prints the ignored paths when at least one matches,
    // and exits non-zero (no output) when none match. Treat a non-success result as
    // "none ignored" rather than an error — the feature simply stays disabled.
    const result = await this.executor.execute({
      args: ['check-ignore', '--', ...envFiles],
      cwd: this.workspacePath,
    });
    const ignoredEnvFiles = result.success ? splitNonEmptyLines(result.value.stdout) : [];

    return ok({ ignoredEnvFiles, envFilesPresent: true });
  }

  /**
   * Copy gitignored `.env*` files from the current worktree into a freshly created one.
   *
   * Security guard: a file ignored in the *source* worktree may NOT be ignored by the
   * *target* branch's `.gitignore` (different rules, or a `!.env.dev` negation). Copying
   * such a file would land an untracked, commit-eligible secret. So we re-run
   * `git check-ignore` *in the target worktree* and only copy files it still ignores —
   * any others are reported via `skippedNotIgnored` and left out.
   *
   * Re-detects source candidates on the backend (never trusts a caller-supplied list),
   * skips files already present at the target, and treats per-file copy failures as
   * non-fatal so a copy problem never undoes the worktree.
   */
  async copyIgnoredEnvFilesTo(
    targetWorktreePath: string
  ): Promise<Result<{ copied: string[]; skippedNotIgnored: string[] }>> {
    const detection = await this.detectCopyableEnvFiles();
    if (!detection.success) return detection;

    const candidates = detection.value.ignoredEnvFiles;
    if (candidates.length === 0) return ok({ copied: [], skippedNotIgnored: [] });

    // Authoritative check against the target branch's checked-out ignore rules.
    // Non-success (nothing ignored) → treat every candidate as not-ignored-at-target.
    const targetCheck = await this.executor.execute({
      args: ['check-ignore', '--', ...candidates],
      cwd: targetWorktreePath,
    });
    const ignoredAtTarget = new Set(
      targetCheck.success ? splitNonEmptyLines(targetCheck.value.stdout) : []
    );

    const copied: string[] = [];
    const skippedNotIgnored: string[] = [];
    for (const name of candidates) {
      if (!ignoredAtTarget.has(name)) {
        skippedNotIgnored.push(name);
        continue;
      }
      const source = path.join(this.workspacePath, name);
      const destination = path.join(targetWorktreePath, name);
      if (!existsSync(source) || existsSync(destination)) continue;
      try {
        await copyFile(source, destination);
        copied.push(name);
      } catch (error) {
        this.log.warn(`Failed to copy ${name} into new worktree: ${(error as Error).message}`);
      }
    }

    if (copied.length > 0) this.log.info(`Copied git ignored .env* files into worktree: ${copied.join(', ')}`);
    if (skippedNotIgnored.length > 0) {
      this.log.warn(
        `Did not copy env files not ignored by the target branch (would be exposed as untracked): ${skippedNotIgnored.join(', ')}`
      );
    }
    return ok({ copied, skippedNotIgnored });
  }

  async removeWorktree(worktreePath: string, opts?: { force?: boolean }): Promise<Result<void>> {
    this.log.info(`Remove worktree at ${worktreePath}${opts?.force ? ' (force)' : ''}`);

    const pathCheck = validateWorktreePath(worktreePath);
    if (!pathCheck.success) return pathCheck;

    // Without force, refuse a dirty worktree up-front with a readable message
    // rather than letting git surface raw stderr (research R9, SC-005).
    if (!opts?.force) {
      const dirty = await isDirtyWorkingTree(this.executor, pathCheck.value);
      if (dirty.success && dirty.value) {
        return err(
          new GitError(
            'This worktree has uncommitted changes. Enable "force" to remove it and discard those changes.',
            'COMMAND_FAILED'
          )
        );
      }
    }

    const args = ['worktree', 'remove'];
    if (opts?.force) args.push('--force');
    args.push(pathCheck.value);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(undefined);
  }

  async pruneWorktrees(): Promise<Result<void>> {
    this.log.info('Prune worktrees');
    const result = await this.executor.execute({
      args: ['worktree', 'prune'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(undefined);
  }
}
