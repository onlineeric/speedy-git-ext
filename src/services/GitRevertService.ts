import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { RevertState, RevertOptions } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';
import { isConflictStderr } from '../utils/gitParsers.js';

/** Git reverted nothing because the branch already contains the inverse of the commit. */
const ALREADY_REVERTED_MESSAGE =
  'This commit introduces no changes relative to the current branch. The revert is already present.';

/**
 * Shown by both modes built on `git revert --no-commit`, which pair it with the
 * `REVERT_CONFLICT_NO_RECOVERY` code so the webview raises a toast without entering
 * the revert-in-progress UI state.
 *
 * KNOWN GAP (verified on git 2.43): `git revert --no-commit` *does* write
 * `.git/REVERT_HEAD`, on success and on conflict alike, and `git revert --continue`
 * works once the conflict is resolved — so this message's "no Continue/Abort step" is
 * not strictly true, and `getRevertState()` reports in-progress on the next refresh
 * even after these modes succeed. Correcting it means changing what `revertState`
 * means for the whole UI, so it is left as-is.
 */
const NO_COMMIT_CONFLICT_MESSAGE =
  'Revert paused due to conflict. Resolve conflicts in the Source Control panel, then commit the result manually (this mode does not enter git\'s revert state machine, so there is no Continue/Abort step).';

export class GitRevertService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getRevertState(): Promise<Result<RevertState>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', 'REVERT_HEAD'],
      cwd: this.workspacePath,
    });
    const state: RevertState = result.success ? 'in-progress' : 'idle';
    return ok(state);
  }

  /**
   * True when the index differs from HEAD. `git diff --cached --quiet` exits 0 when
   * the index is clean, so any non-zero exit — including a failure to run the probe
   * at all — reads as dirty, which is the safe direction for every caller here.
   */
  private async isIndexDirty(): Promise<boolean> {
    const result = await this.executor.execute({
      args: ['diff', '--cached', '--quiet'],
      cwd: this.workspacePath,
    });
    return !result.success;
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

    // No working-tree pre-check: `git revert` accepts untracked files and tracked edits
    // the patch does not touch. It refuses — naming the files — when it would overwrite a
    // locally modified one, and (for its commit-producing form) when the index differs
    // from HEAD. Either way it leaves no REVERT_HEAD behind, so the refusal below cannot
    // be mistaken for a paused revert.
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
    // This mode produces a commit, so it must hold to the rule git holds every
    // commit-producing revert to: the index must match HEAD. Git enforces that
    // itself for `git revert <hash>` ("your local changes would be overwritten by
    // revert"), but not for the `--no-commit` step this mode builds on — and step 2
    // commits the whole index, so anything the user had staged would be swept into
    // the revert commit.
    if (await this.isIndexDirty()) {
      return err(new GitError(
        'You have staged changes. Reverting with a custom message commits the whole index, so those changes would be swept into the revert commit. Commit or unstage them first.',
        'COMMAND_FAILED'
      ));
    }

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
        return err(new GitError(ALREADY_REVERTED_MESSAGE, 'COMMAND_FAILED'));
      }
      if (isConflictStderr(errorDetail)) {
        return err(new GitError(NO_COMMIT_CONFLICT_MESSAGE, 'REVERT_CONFLICT_NO_RECOVERY'));
      }
      return step1;
    }

    // Between steps: the index was clean before step 1, so anything staged now is the
    // inverse patch. Nothing staged means there was no net change to revert — stop
    // before creating an empty commit.
    if (!(await this.isIndexDirty())) {
      return err(new GitError(ALREADY_REVERTED_MESSAGE, 'COMMAND_FAILED'));
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
        return err(new GitError(ALREADY_REVERTED_MESSAGE, 'COMMAND_FAILED'));
      }
      if (isConflictStderr(errorDetail)) {
        return err(new GitError(NO_COMMIT_CONFLICT_MESSAGE, 'REVERT_CONFLICT_NO_RECOVERY'));
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
        return err(new GitError(ALREADY_REVERTED_MESSAGE, 'COMMAND_FAILED'));
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
