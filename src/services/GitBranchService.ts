import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import { validateRefName } from '../utils/gitValidation.js';

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

      return trackResult;
    }

    return result;
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

  async createBranch(name: string, startPoint?: string): Promise<Result<string>> {
    this.log.info(`Create branch: ${name}${startPoint ? ` from ${startPoint}` : ''}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;
    if (startPoint) {
      const startCheck = validateRefName(startPoint);
      if (!startCheck.success) return startCheck;
    }

    const args = ['branch', name];
    if (startPoint) args.push(startPoint);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Created branch '${name}'`);
  }

  async renameBranch(oldName: string, newName: string): Promise<Result<string>> {
    this.log.info(`Rename branch: ${oldName} → ${newName}`);
    const oldCheck = validateRefName(oldName);
    if (!oldCheck.success) return oldCheck;
    const newCheck = validateRefName(newName);
    if (!newCheck.success) return newCheck;

    const result = await this.executor.execute({
      args: ['branch', '-m', oldName, newName],
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
    if (!result.success) return result;
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

  async merge(branch: string, noFastForward?: boolean, squash?: boolean): Promise<Result<string>> {
    this.log.info(`Merge branch: ${branch}${noFastForward ? ' --no-ff' : ''}${squash ? ' --squash' : ''}`);
    const branchCheck = validateRefName(branch);
    if (!branchCheck.success) return branchCheck;

    const args = ['merge'];
    if (noFastForward) args.push('--no-ff');
    if (squash) args.push('--squash');
    args.push(branch);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Merged '${branch}' into current branch`);
  }
}
