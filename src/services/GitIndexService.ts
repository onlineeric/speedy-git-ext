import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';

export class GitIndexService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async stageFiles(paths: string[]): Promise<Result<string>> {
    this.log.info(`Stage files: ${paths.join(', ')}`);
    const result = await this.executor.execute({
      args: ['add', '--', ...paths],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Staged ${paths.length} file(s)`);
  }

  async unstageFiles(paths: string[]): Promise<Result<string>> {
    this.log.info(`Unstage files: ${paths.join(', ')}`);
    const result = await this.executor.execute({
      args: ['reset', 'HEAD', '--', ...paths],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Unstaged ${paths.length} file(s)`);
  }

  async stageAll(): Promise<Result<string>> {
    this.log.info('Stage all changes');
    const result = await this.executor.execute({
      args: ['add', '-A'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Staged all changes');
  }

  async unstageAll(): Promise<Result<string>> {
    this.log.info('Unstage all changes');
    const result = await this.executor.execute({
      args: ['reset', 'HEAD'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Unstaged all changes');
  }

  async discardFiles(paths: string[], includeUntracked: boolean): Promise<Result<string>> {
    this.log.info(`Discard files: ${paths.join(', ')} (includeUntracked=${includeUntracked})`);

    // Separate tracked and untracked by attempting checkout first for all,
    // then clean for untracked paths
    const checkoutResult = await this.executor.execute({
      args: ['checkout', '--', ...paths],
      cwd: this.workspacePath,
    });

    if (includeUntracked) {
      const cleanResult = await this.executor.execute({
        args: ['clean', '-f', '--', ...paths],
        cwd: this.workspacePath,
      });
      // If checkout failed but clean succeeded (all untracked), that's fine
      if (!checkoutResult.success && !cleanResult.success) return cleanResult;
    } else if (!checkoutResult.success) {
      return checkoutResult;
    }

    return ok(`Discarded changes in ${paths.length} file(s)`);
  }

  async discardAllUnstaged(): Promise<Result<string>> {
    this.log.info('Discard all unstaged changes');
    const checkoutResult = await this.executor.execute({
      args: ['checkout', '--', '.'],
      cwd: this.workspacePath,
    });
    if (!checkoutResult.success) return checkoutResult;

    const cleanResult = await this.executor.execute({
      args: ['clean', '-fd'],
      cwd: this.workspacePath,
    });
    if (!cleanResult.success) return cleanResult;

    return ok('Discarded all unstaged changes');
  }
}
