import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, err, ok } from '../../shared/errors.js';
import { validateLocalBranchName, validateRefName } from '../utils/gitValidation.js';
import { isDirtyWorkingTree } from '../utils/gitQueries.js';
import { mapWorktreeConflictError } from '../utils/worktreeErrors.js';

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

  isDirtyWorkingTree(): Promise<Result<boolean>> {
    this.log.info('Check dirty working tree');
    return isDirtyWorkingTree(this.executor, this.workspacePath);
  }

  async merge(branch: string, noFastForward?: boolean, squash?: boolean, noCommit?: boolean): Promise<Result<string>> {
    this.log.info(`Merge branch: ${branch}${noFastForward ? ' --no-ff' : ''}${squash ? ' --squash' : ''}${noCommit ? ' --no-commit' : ''}`);
    const branchCheck = validateRefName(branch);
    if (!branchCheck.success) return branchCheck;

    const args = ['merge'];
    if (noCommit) {
      args.push('--no-commit', '--no-ff');
    } else if (noFastForward) {
      args.push('--no-ff');
    }
    if (squash) args.push('--squash');
    args.push(branch);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Merged '${branch}' into current branch`);
  }
}
