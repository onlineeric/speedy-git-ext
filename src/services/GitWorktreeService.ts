import { existsSync } from 'node:fs';
import path from 'node:path';
import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { WorktreeInfo, WorktreeBranchMode } from '../../shared/types.js';
import { isDirtyWorkingTree } from '../utils/gitQueries.js';
import { validateRefName, validateWorktreePath } from '../utils/gitValidation.js';
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

  const branches = result.value.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

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
      const nameCheck = validateRefName(name);
      if (!nameCheck.success) return nameCheck;
      args.push('-b', name, pathCheck.value, opts.ref);
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
