import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { RevertState } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';
import { isConflictStderr } from '../utils/gitParsers.js';
import { isDirtyWorkingTree } from '../utils/gitQueries.js';

export class GitRevertService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  isDirtyWorkingTree(): Promise<Result<boolean>> {
    return isDirtyWorkingTree(this.executor, this.workspacePath);
  }

  async getRevertState(): Promise<Result<RevertState>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', 'REVERT_HEAD'],
      cwd: this.workspacePath,
    });
    const state: RevertState = result.success ? 'in-progress' : 'idle';
    return ok(state);
  }

  private async isRevertInProgress(): Promise<boolean> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', 'REVERT_HEAD'],
      cwd: this.workspacePath,
    });
    return result.success;
  }

  async revert(hash: string, mainlineParent?: number): Promise<Result<string>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const dirtyCheck = await this.isDirtyWorkingTree();
    if (!dirtyCheck.success) return dirtyCheck;
    if (dirtyCheck.value) {
      return err(new GitError(
        'Working tree has uncommitted changes. Commit, stash, or discard them before reverting.',
        'COMMAND_FAILED'
      ));
    }

    if (await this.isRevertInProgress()) {
      return err(new GitError(
        'A revert is already in progress. Continue or abort it before starting another revert.',
        'REVERT_IN_PROGRESS'
      ));
    }

    const args = ['revert'];
    if (mainlineParent !== undefined) {
      args.push('-m', String(mainlineParent));
    }
    args.push('--no-edit', hash);

    this.log.info(`Revert commit: ${hash}`);
    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) {
      const errorDetail = result.error.stderr || result.error.message || '';
      if (errorDetail.includes('nothing to commit') || errorDetail.includes('nothing to revert')) {
        return err(new GitError(
          'This commit introduces no changes relative to the current branch. The revert is already present.',
          'COMMAND_FAILED'
        ));
      }
      if (await this.isRevertInProgress() || isConflictStderr(errorDetail)) {
        return err(new GitError(
          'Revert paused due to conflict. Resolve conflicts in the Source Control panel, then continue.',
          'REVERT_CONFLICT'
        ));
      }
      return result;
    }

    return ok(`Reverted ${hash.slice(0, 7)} successfully.`);
  }

  async continueRevert(): Promise<Result<string>> {
    this.log.info('Continue revert');
    const result = await this.executor.execute({
      args: ['revert', '--continue'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Revert continued successfully.');
  }

  async abortRevert(): Promise<Result<string>> {
    this.log.info('Abort revert');
    const result = await this.executor.execute({
      args: ['revert', '--abort'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Revert aborted.');
  }
}
