import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import { trimCommitMessage } from '../utils/gitParsers.js';
import { validateHash } from '../utils/gitValidation.js';

/**
 * Committing runs `pre-commit` and `commit-msg` hooks, and git runs them even
 * for a message-only amend where the tree does not change. husky/lint-staged
 * setups routinely take tens of seconds, so this operation gets a longer ceiling
 * than the executor's 30s default — long enough for ordinary hook tooling, short
 * enough to fail rather than hang on something stuck.
 */
const AMEND_TIMEOUT_MS = 60_000;

/**
 * What we tell the user after we stopped waiting on a commit — the wait ended,
 * the hook process did not. lint-staged in particular carries on modifying files
 * after git is killed.
 */
const HOOKS_STILL_RUNNING =
  'Note: only the wait was stopped, not the hook process itself — it may still be running and modifying files.';

export interface AmendOptions {
  /** The complete new commit message, exactly as it should be stored. */
  message: string;
  /** Fold the current index into the commit, rather than amending the message alone. */
  includeStaged: boolean;
  /** Hash the dialog was opened against; the amend is refused if HEAD has moved. */
  expectedHead: string;
  abortSignal?: AbortSignal;
}

/**
 * Creating and rewriting commits.
 *
 * Separate from `GitIndexService`, which manipulates the index: an amend writes
 * a commit object, and reasoning about "what is staged" is exactly the thing it
 * is deliberately *not* doing when `includeStaged` is false.
 */
export class GitCommitService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  /**
   * A commit's complete raw message (`%B`), trailing newlines trimmed.
   *
   * Subject-only reads are what made interactive-rebase reword drop bodies; any
   * dialog that prefills a message the user may confirm unchanged must read the
   * whole thing.
   */
  async getCommitMessage(hash: string): Promise<Result<string>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['log', '-1', '--format=%B', hash, '--'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    return ok(trimCommitMessage(result.value.stdout));
  }

  /**
   * Rewrite the tip commit's message, optionally folding in the index.
   *
   * `git commit --amend` has no target — it rewrites whatever HEAD is when it
   * runs — while the dialog above shows one specific commit and prefills its
   * message. If HEAD moves in between (a commit from VS Code's SCM view, a
   * terminal, a checkout) the two come apart silently: one commit's message is
   * written onto a different commit. Hence `expectedHead`.
   */
  async amendCommit(options: AmendOptions): Promise<Result<string>> {
    const { message, includeStaged, expectedHead, abortSignal } = options;

    const hashCheck = validateHash(expectedHead);
    if (!hashCheck.success) return hashCheck;

    const headCheck = await this.readHead();
    if (!headCheck.success) return headCheck;
    if (headCheck.value !== expectedHead) {
      return err(
        new GitError(
          'The current tip commit changed since this dialog was opened, so nothing was amended. Close and reopen the dialog to amend the new tip.',
          'HEAD_MOVED'
        )
      );
    }

    this.log.info(`Amend HEAD (${includeStaged ? 'including staged changes' : 'message only'})`);

    // The message is fed on stdin, never as `-m`: it is multi-line and may hold
    // quotes, backticks and non-ASCII, and `-F` additionally selects git's
    // `whitespace` cleanup instead of `strip`, so a body line starting with `#`
    // survives instead of being read as a comment and deleted. `-F -` gets both
    // without a temp file — the executor already writes and closes stdin.
    //
    // `--only` with no pathspec is what keeps the index out of the amend: the
    // commit is rewritten from HEAD's own tree, and staged files stay staged for
    // the next commit. Without it git absorbs the index, which is plain amend's
    // behaviour and the classic amend footgun.
    const args = ['commit', '--amend'];
    if (!includeStaged) args.push('--only');
    args.push('-F', '-');

    // No `env` override: GitExecutor's no-op GIT_EDITOR is exactly right here
    // (an amend without `-F` would otherwise open an editor, accept the
    // unchanged message and "succeed"), and hooks need the inherited
    // environment to find their tooling.
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
      stdin: message,
      timeout: AMEND_TIMEOUT_MS,
      abortSignal,
    });

    if (result.success) return ok('Commit amended.');
    if (result.error.code === 'CANCELLED' || result.error.code === 'TIMEOUT') {
      return this.describeInterruptedAmend(result.error, expectedHead);
    }
    return err(result.error);
  }

  /**
   * Report what an interrupted amend actually did, by looking rather than
   * assuming.
   *
   * Cancelling and timing out both end our *wait*; neither states the outcome.
   * Hooks run before the commit object is written, so almost always nothing was
   * created — but killing git in the window between the object being written and
   * the process exiting leaves the amend done. "Did my history get rewritten or
   * not?" is the worst question to leave a user holding, and an assumption that
   * is wrong one time in a hundred is exactly how they end up holding it. So HEAD
   * is re-read and compared with the commit the dialog was opened against.
   */
  private async describeInterruptedAmend(
    cause: GitError,
    expectedHead: string
  ): Promise<Result<string>> {
    const head = await this.readHead();
    const stoppedWaiting =
      cause.code === 'TIMEOUT'
        ? `The amend did not finish within ${AMEND_TIMEOUT_MS / 1000} seconds, so waiting stopped.`
        : 'Waiting for the amend was cancelled.';

    if (!head.success) {
      // We could not look, so we do not claim. Naming the uncertainty beats
      // guessing in either direction.
      return err(
        new GitError(
          `${stoppedWaiting} Whether the commit was amended could not be determined — check the graph after refreshing. ${HOOKS_STILL_RUNNING}`,
          cause.code,
          cause.command
        )
      );
    }

    if (head.value !== expectedHead) {
      // Observed: the commit object was written before git went away. This is a
      // completed amend, so it is reported as one — the graph must reload and
      // the dialog must close, exactly as on the ordinary success path.
      return ok(`Commit amended. ${stoppedWaiting} The amend had already completed. ${HOOKS_STILL_RUNNING}`);
    }

    return err(
      new GitError(
        `${stoppedWaiting} The commit was not amended. ${HOOKS_STILL_RUNNING}`,
        cause.code,
        cause.command
      )
    );
  }

  private async readHead(): Promise<Result<string>> {
    const result = await this.executor.execute({
      args: ['rev-parse', 'HEAD'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(result.value.stdout.trim());
  }
}
