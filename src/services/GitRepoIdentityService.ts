import * as path from 'path';
import type { LogOutputChannel } from 'vscode';
import { GitError, err, ok, type Result } from '../../shared/errors.js';
import { normalizeRepoPath, type RepoIdentity } from '../utils/repoIdentity.js';
import { GitExecutor } from './GitExecutor.js';

/**
 * Resolves and caches a repository's {@link RepoIdentity} — extension-wide, not
 * per tab, so N tabs on one repo cost one `rev-parse`.
 *
 * The cache is kept for the whole session: a repo's git dir does not move under
 * a running window. The one case that would invalidate it — a `.git` file
 * rewritten by `git worktree repair` — is rare enough to accept until the
 * window reloads; `invalidate` exists for tests and the repo-removed path.
 */
export class GitRepoIdentityService {
  private readonly cache = new Map<string, RepoIdentity>();
  private readonly inFlight = new Map<string, Promise<Result<RepoIdentity>>>();
  private readonly executor: GitExecutor;

  constructor(private readonly log: LogOutputChannel) {
    this.executor = new GitExecutor(log);
  }

  /** The cached identity, or `null` when this path has not resolved yet. */
  peek(repoPath: string): RepoIdentity | null {
    return this.cache.get(normalizeRepoPath(repoPath)) ?? null;
  }

  async resolve(repoPath: string): Promise<Result<RepoIdentity>> {
    const key = normalizeRepoPath(repoPath);
    if (!key) {
      return err(new GitError('Cannot resolve repository identity for an empty path', 'VALIDATION_ERROR'));
    }

    const cached = this.cache.get(key);
    if (cached) return ok(cached);

    // Two tabs opening the same repo at once must not spawn twice.
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const run = this.run(key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  invalidate(repoPath: string): void {
    this.cache.delete(normalizeRepoPath(repoPath));
  }

  private async run(key: string): Promise<Result<RepoIdentity>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--absolute-git-dir', '--git-common-dir', '--show-toplevel'],
      cwd: key,
    });

    if (!result.success) {
      this.log.debug(`GitRepoIdentityService: could not resolve ${key} — ${result.error.message}`);
      return result;
    }

    // A bare repo answers nothing for `--show-toplevel`, so the third line may
    // be absent rather than empty.
    const lines = result.value.stdout.split('\n').map((line) => line.trim());
    const gitDir = lines[0] ?? '';
    const rawCommonDir = lines[1] ?? '';
    const topLevel = lines[2] ?? '';

    if (!gitDir) {
      return err(new GitError(`git rev-parse returned no git directory for ${key}`, 'PARSE_ERROR'));
    }

    // `--git-common-dir` may answer a RELATIVE path (`.` for a plain repo), and
    // it is relative to the git dir — not to cwd.
    const commonGitDir = path.isAbsolute(rawCommonDir)
      ? normalizeRepoPath(rawCommonDir)
      : normalizeRepoPath(path.resolve(gitDir, rawCommonDir || '.'));

    const identity: RepoIdentity = {
      repoPath: key,
      gitDir: normalizeRepoPath(gitDir),
      commonGitDir,
      topLevel: topLevel ? normalizeRepoPath(topLevel) : '',
    };
    this.cache.set(key, identity);
    return ok(identity);
  }
}
