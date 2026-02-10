import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';

export class GitBranchService {
  private executor: GitExecutor;

  constructor(private readonly workspacePath: string) {
    this.executor = new GitExecutor();
  }

  async checkout(name: string, remote?: string): Promise<Result<string>> {
    const args = ['checkout'];

    if (remote) {
      // Checking out a remote branch creates a local tracking branch
      args.push('-b', name, `${remote}/${name}`);
    } else {
      args.push(name);
    }

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Checked out '${name}'`);
  }

  async fetch(remote?: string, prune?: boolean): Promise<Result<string>> {
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
