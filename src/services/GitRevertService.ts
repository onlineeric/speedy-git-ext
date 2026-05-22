import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { RevertState, RevertOptions } from '../../shared/types.js';
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

  async revert(hash: string, options: RevertOptions): Promise<Result<string>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    // edit-message: validate the message BEFORE running any git command (T027).
    if (options.mode === 'edit-message') {
      const message = options.message ?? '';
      if (message.trim().length === 0) {
        return err(new GitError(
          'A commit message is required when reverting with Edit message mode.',
          'VALIDATION_ERROR'
        ));
      }
    }

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

    switch (options.mode) {
      case 'commit':
        return this.revertWithCommit(hash, options.mainlineParent);
      case 'no-commit':
        return this.revertNoCommit(hash, options.mainlineParent);
      case 'edit-message':
        // message non-emptiness already validated above
        return this.revertWithEditMessage(hash, options.message as string, options.mainlineParent);
    }
  }

  private async revertWithEditMessage(
    hash: string,
    message: string,
    mainlineParent?: number
  ): Promise<Result<string>> {
    // Step 1: stage the inverse changes without committing.
    const step1Args = ['revert'];
    if (mainlineParent !== undefined) {
      step1Args.push('-m', String(mainlineParent));
    }
    step1Args.push('--no-commit', hash);

    this.log.info(`Revert commit (edit message): ${hash}`);
    const step1 = await this.executor.execute({ args: step1Args, cwd: this.workspacePath });
    if (!step1.success) {
      const errorDetail = step1.error.stderr || step1.error.message || '';
      if (errorDetail.includes('nothing to commit') || errorDetail.includes('nothing to revert')) {
        return err(new GitError(
          'This commit introduces no changes relative to the current branch. The revert is already present.',
          'COMMAND_FAILED'
        ));
      }
      if (isConflictStderr(errorDetail)) {
        return err(new GitError(
          'Revert paused due to conflict. Resolve conflicts in the Source Control panel, then commit the result manually (this mode does not enter git\'s revert state machine, so there is no Continue/Abort step).',
          'REVERT_CONFLICT_NO_RECOVERY'
        ));
      }
      return step1;
    }

    // Between steps: detect "no net change" before creating an empty commit.
    // `git diff --cached --quiet` exits 0 when nothing is staged.
    const diffCheck = await this.executor.execute({
      args: ['diff', '--cached', '--quiet'],
      cwd: this.workspacePath,
    });
    if (diffCheck.success) {
      // exit 0 → nothing staged → abort before step 2
      return err(new GitError(
        'This commit introduces no changes relative to the current branch. The revert is already present.',
        'COMMAND_FAILED'
      ));
    }

    // Step 2: commit with the user's message. Git's default cleanup would
    // mutate whitespace, so disable cleanup after applying the spec's only
    // allowed normalization: trim trailing whitespace on the final line.
    const normalizedMessage = trimFinalLineTrailingWhitespace(message);
    const step2 = await this.executor.execute({
      args: ['commit', '--cleanup=verbatim', '-m', normalizedMessage],
      cwd: this.workspacePath,
    });
    if (!step2.success) {
      // Propagate as-is. Inverse changes stay staged for manual recovery.
      return step2;
    }

    return ok(`Reverted ${hash.slice(0, 7)} with custom message.`);
  }

  private async revertNoCommit(hash: string, mainlineParent?: number): Promise<Result<string>> {
    const args = ['revert'];
    if (mainlineParent !== undefined) {
      args.push('-m', String(mainlineParent));
    }
    args.push('--no-commit', hash);

    this.log.info(`Revert commit (stage only): ${hash}`);
    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) {
      const errorDetail = result.error.stderr || result.error.message || '';
      if (errorDetail.includes('nothing to commit') || errorDetail.includes('nothing to revert')) {
        return err(new GitError(
          'This commit introduces no changes relative to the current branch. The revert is already present.',
          'COMMAND_FAILED'
        ));
      }
      // git revert --no-commit does NOT set REVERT_HEAD, so we cannot use the
      // Continue/Abort recovery path. Surface a distinct code so the webview
      // routes the toast without entering the revert-in-progress UI state.
      if (isConflictStderr(errorDetail)) {
        return err(new GitError(
          'Revert paused due to conflict. Resolve conflicts in the Source Control panel, then commit the result manually (this mode does not enter git\'s revert state machine, so there is no Continue/Abort step).',
          'REVERT_CONFLICT_NO_RECOVERY'
        ));
      }
      return result;
    }

    return ok(`Reverted ${hash.slice(0, 7)} — changes staged. Commit when ready.`);
  }

  private async revertWithCommit(hash: string, mainlineParent?: number): Promise<Result<string>> {
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

function trimFinalLineTrailingWhitespace(message: string): string {
  const lastNewlineIndex = message.lastIndexOf('\n');
  if (lastNewlineIndex === -1) {
    return message.trimEnd();
  }

  const prefix = message.slice(0, lastNewlineIndex + 1);
  const finalLine = message.slice(lastNewlineIndex + 1).trimEnd();
  return `${prefix}${finalLine}`;
}
