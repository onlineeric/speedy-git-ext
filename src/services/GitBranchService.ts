import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, err, ok } from '../../shared/errors.js';
import { validateLocalBranchName, validateRefName } from '../utils/gitValidation.js';
import { mapWorktreeConflictError } from '../utils/worktreeErrors.js';
import { gitErrorDetail, isConflictStderr } from '../utils/gitParsers.js';
import type { MergeState } from '../../shared/types.js';

function isBranchNotFullyMerged(stderr: string | undefined): boolean {
  return stderr?.includes('is not fully merged') ?? false;
}

export function isCheckoutConflict(error: GitError): boolean {
  return error.message.includes('would be overwritten by checkout');
}

/**
 * Map git's "branch is already checked out at <path>" refusal (raised when the
 * target branch is held by another worktree) to a readable message naming the
 * conflicting worktree (FR-024 / T042). Returns the original error otherwise.
 */
function mapWorktreeCheckoutError(error: GitError): GitError {
  return mapWorktreeConflictError(
    error,
    (conflictingPath) =>
      `That branch is checked out in another worktree at "${conflictingPath}". Open that worktree's window to work on it, or remove the worktree first.`
  );
}

export class GitBranchService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async checkout(name: string, remote?: string): Promise<Result<string>> {
    this.log.info(`Checkout branch: ${name}${remote ? ` (remote: ${remote})` : ''}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;
    if (remote) {
      const remoteCheck = validateRefName(remote);
      if (!remoteCheck.success) return remoteCheck;
    }

    // Always use `git checkout <name>` first.
    // Git automatically creates a local tracking branch if only one remote matches.
    const result = await this.executor.execute({
      args: ['checkout', name],
      cwd: this.workspacePath,
    });

    if (result.success) {
      return ok(`Checked out '${name}'`);
    }

    // If a simple checkout failed and a remote was specified,
    // try explicitly creating a tracking branch (e.g. when multiple remotes have the same branch name)
    if (remote) {
      const trackResult = await this.executor.execute({
        args: ['checkout', '-b', name, `${remote}/${name}`],
        cwd: this.workspacePath,
      });

      if (trackResult.success) {
        return ok(`Checked out '${name}' tracking ${remote}/${name}`);
      }

      return err(mapWorktreeCheckoutError(trackResult.error));
    }

    return err(mapWorktreeCheckoutError(result.error));
  }

  async checkoutCommit(hash: string): Promise<Result<string, GitError>> {
    this.log.info(`Checkout commit: ${hash}`);

    const result = await this.executor.execute({
      args: ['checkout', hash],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Checked out commit ${hash}`);
  }

  async fetch(remote?: string, prune?: boolean): Promise<Result<string>> {
    this.log.info(`Fetch remote: ${remote ?? 'all'}${prune ? ' (prune)' : ''}`);
    if (remote) {
      const remoteCheck = validateRefName(remote);
      if (!remoteCheck.success) return remoteCheck;
    }

    const args = ['fetch'];

    if (remote) {
      args.push(remote);
    } else {
      args.push('--all');
    }

    if (prune) {
      args.push('--prune');
    }

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
      timeout: 60000, // Network operations get longer timeout
    });

    if (!result.success) {
      return result;
    }

    return ok('Fetch completed');
  }

  async fastForwardFromRemote(remote: string, branch: string, setUpstream?: boolean): Promise<Result<string>> {
    this.log.info(`Fast-forward local branch: ${remote}/${branch}${setUpstream ? ' (set upstream)' : ''}`);

    const remoteCheck = validateRefName(remote);
    if (!remoteCheck.success) return remoteCheck;
    const branchCheck = validateLocalBranchName(branch);
    if (!branchCheck.success) return branchCheck;

    const fetchResult = await this.executor.execute({
      args: ['fetch', remote, `${branch}:${branch}`],
      cwd: this.workspacePath,
      timeout: 60000,
    });

    if (!fetchResult.success) {
      return fetchResult;
    }

    // Only wire up upstream tracking when the caller asked for it (i.e. a new
    // local branch was just created from a remote-only badge). Skipping this
    // step on established branches preserves any pre-existing upstream config
    // (e.g. a fork workflow where `feature-x` tracks `upstream/feature-x`).
    if (setUpstream) {
      const upstreamResult = await this.executor.execute({
        args: ['branch', `--set-upstream-to=${remote}/${branch}`, branch],
        cwd: this.workspacePath,
      });

      if (!upstreamResult.success) {
        return upstreamResult;
      }
    }

    return ok('Fast-forward completed');
  }

  async createBranch(name: string, startPoint?: string): Promise<Result<string>> {
    this.log.info(`Create branch: ${name}${startPoint ? ` from ${startPoint}` : ''}`);
    const nameCheck = validateLocalBranchName(name);
    if (!nameCheck.success) return nameCheck;
    if (startPoint) {
      const startCheck = validateRefName(startPoint);
      if (!startCheck.success) return startCheck;
    }

    const args = ['branch', nameCheck.value];
    if (startPoint) args.push(startPoint);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Created branch '${name}'`);
  }

  async renameBranch(oldName: string, newName: string): Promise<Result<string>> {
    this.log.info(`Rename branch: ${oldName} → ${newName}`);
    const oldCheck = validateRefName(oldName);
    if (!oldCheck.success) return oldCheck;
    const newCheck = validateLocalBranchName(newName);
    if (!newCheck.success) return newCheck;

    const result = await this.executor.execute({
      args: ['branch', '-m', oldName, newCheck.value],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Renamed branch '${oldName}' to '${newName}'`);
  }

  async deleteBranch(name: string, force?: boolean): Promise<Result<string>> {
    this.log.info(`Delete branch: ${name}${force ? ' (force)' : ''}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['branch', force ? '-D' : '-d', name],
      cwd: this.workspacePath,
    });
    if (!result.success) {
      if (!force && isBranchNotFullyMerged(result.error.stderr)) {
        return err(
          new GitError(
            `Branch '${name}' is not fully merged and requires force deletion.`,
            'BRANCH_NOT_FULLY_MERGED',
            result.error.command,
            result.error.stderr
          )
        );
      }
      return result;
    }
    return ok(`Deleted branch '${name}'`);
  }

  async deleteRemoteBranch(remote: string, name: string): Promise<Result<string>> {
    this.log.info(`Delete remote branch: ${remote}/${name}`);
    const remoteCheck = validateRefName(remote);
    if (!remoteCheck.success) return remoteCheck;
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['push', remote, '--delete', name],
      cwd: this.workspacePath,
      timeout: 60000,
    });
    if (!result.success) return result;
    return ok(`Deleted remote branch '${remote}/${name}'`);
  }

  /**
   * Whether a merge is paused with `MERGE_HEAD` written — the only state
   * `git merge --continue` / `--abort` can act on.
   */
  async getMergeState(): Promise<Result<MergeState>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', '--quiet', 'MERGE_HEAD'],
      cwd: this.workspacePath,
    });
    return ok(result.success ? 'in-progress' : 'idle');
  }

  /**
   * Merge any commit-ish into the current branch.
   *
   * `ref` is deliberately not "a branch": git merges branches, remote-tracking
   * branches, tags and raw commit hashes through the same command, and the UI
   * offers all four. Nothing here narrows that — see `validateRefName`, which
   * only rejects what git itself would refuse to parse as a ref.
   */
  async merge(ref: string, noFastForward?: boolean, squash?: boolean, noCommit?: boolean): Promise<Result<string>> {
    this.log.info(`Merge: ${ref}${noFastForward ? ' --no-ff' : ''}${squash ? ' --squash' : ''}${noCommit ? ' --no-commit' : ''}`);
    const refCheck = validateRefName(ref);
    if (!refCheck.success) return refCheck;

    const args = ['merge'];
    if (noCommit) {
      args.push('--no-commit', '--no-ff');
    } else if (noFastForward) {
      args.push('--no-ff');
    }
    if (squash) args.push('--squash');
    args.push(ref);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return this.toMergeError(result.error);
    return ok(`Merged '${ref}' into current branch`);
  }

  /**
   * Classify a failed merge.
   *
   * `MERGE_HEAD` is the discriminator rather than the stderr text, because the
   * two conflict outcomes need different UI: an ordinary conflicted merge parks
   * in git's merge state and is finished with Continue or thrown away with
   * Abort, while a conflicted `--squash` writes no `MERGE_HEAD` at all — for it,
   * `git merge --continue` and `--abort` both fail with "MERGE_HEAD missing",
   * so offering them would be a dead end. The stderr check is only a fallback
   * for the (rare) conflict git reports before writing the file.
   */
  private async toMergeError(error: GitError): Promise<Result<string>> {
    const state = await this.getMergeState();
    if (state.success && state.value === 'in-progress') {
      return err(new GitError(
        'Merge paused due to conflict. Resolve the conflicts in the Source Control panel, then continue or abort the merge.',
        'MERGE_CONFLICT',
        error.command,
        error.stderr
      ));
    }
    if (isConflictStderr(gitErrorDetail(error))) {
      return err(new GitError(
        'Merge stopped due to conflict. Resolve the conflicts in the Source Control panel and commit the result manually — this merge left no MERGE_HEAD behind, so there is no Continue or Abort step.',
        'MERGE_CONFLICT_NO_RECOVERY',
        error.command,
        error.stderr
      ));
    }
    return err(error);
  }

  async continueMerge(): Promise<Result<string>> {
    this.log.info('Continue merge');
    const result = await this.executor.execute({
      args: ['merge', '--continue'],
      cwd: this.workspacePath,
      // `git merge --continue` opens an editor for the merge message it already
      // prepared; `true` accepts it unchanged instead of hanging until timeout.
      env: { GIT_EDITOR: 'true' },
    });
    if (!result.success) return this.toMergeError(result.error);
    return ok('Merge continued successfully.');
  }

  async abortMerge(): Promise<Result<string>> {
    this.log.info('Abort merge');
    const result = await this.executor.execute({
      args: ['merge', '--abort'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Merge aborted.');
  }
}
