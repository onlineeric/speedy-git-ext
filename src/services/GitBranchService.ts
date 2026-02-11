import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import { validateRefName } from '../utils/gitValidation.js';

export class GitBranchService {
  private executor: GitExecutor;

  constructor(private readonly workspacePath: string) {
    this.executor = new GitExecutor();
  }

  async checkout(name: string, remote?: string): Promise<Result<string>> {
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
}
