import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import { trimCommitMessage } from '../utils/gitParsers.js';
import { validateHash } from '../utils/gitValidation.js';
import { readHeadHash } from '../utils/gitQueries.js';
import { buildFixupCommitArgs, fixupKindUsesEditorMessage, type FixupCommitKind } from '../../shared/fixupCommit.js';
import { createEditorScriptDir, prepareMessageReplacingEditor, removeEditorScriptDir } from './gitEditorScripts.js';

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

export interface FixupCommitOptions {
  kind: FixupCommitKind;
  /** Full hash of the commit the new one targets. */
  targetHash: string;
  /** `-a`; ignored for `reword`, which git refuses to combine with it. */
  includeAllTracked: boolean;
  /** Squash: the optional `-m` text. Amend/reword: the required replacement message. */
  message?: string;
  abortSignal?: AbortSignal;
}

/** How an interrupted commit is named in what we tell the user. */
interface InterruptedCommitWording {
  /** "the amend" */
  operation: string;
  /** "Commit amended." */
  done: string;
  /** "The commit was not amended." */
  notDone: string;
  /** "Whether the commit was amended" */
  unknown: string;
}

const FIXUP_KIND_PREFIX: Record<FixupCommitKind, string> = {
  fixup: 'fixup!',
  squash: 'squash!',
  amend: 'amend!',
  reword: 'amend!',
};

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

    const headCheck = await readHeadHash(this.executor, this.workspacePath);
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
      return this.describeInterruptedCommit(result.error, AMEND_WORDING, async (head) => head !== expectedHead);
    }
    return err(result.error);
  }

  /**
   * `git commit --fixup` / `--squash` on HEAD, targeting another commit.
   *
   * Nothing is pre-validated that git validates itself — "nothing to commit",
   * `-a` with `reword:`, a git too old for `amend:` — so its own error reaches
   * the user. amend/reword refuse `-m` and `-F`, so their message goes through a
   * scripted editor that keeps git's `amend! <subject>` title line.
   */
  async createFixupCommit(options: FixupCommitOptions): Promise<Result<string>> {
    const { kind, targetHash, includeAllTracked, message, abortSignal } = options;

    const hashCheck = validateHash(targetHash);
    if (!hashCheck.success) return hashCheck;

    const usesEditorMessage = fixupKindUsesEditorMessage(kind);
    if (usesEditorMessage && !message?.trim()) {
      return err(new GitError('A message is required for an amend! commit.', 'VALIDATION_ERROR'));
    }

    // Read before running, so an interrupted wait can be judged by looking.
    const headBefore = await readHeadHash(this.executor, this.workspacePath);
    if (!headBefore.success) return headBefore;

    const args = buildFixupCommitArgs({
      kind,
      targetHash,
      includeAllTracked,
      message: kind === 'squash' ? message : undefined,
    });
    this.log.info(`Create ${FIXUP_KIND_PREFIX[kind]} commit (${kind}${includeAllTracked ? ', -a' : ''})`);

    const scriptDir = usesEditorMessage ? createEditorScriptDir('speedy-fixup') : null;
    try {
      const result = await this.executor.execute({
        args,
        cwd: this.workspacePath,
        // fixup/squash need no editor: GitExecutor's no-op one accepts git's
        // prepared `fixup! <subject>` / `squash! <subject>` unchanged.
        env: scriptDir ? prepareMessageReplacingEditor(scriptDir, message ?? '') : undefined,
        timeout: AMEND_TIMEOUT_MS,
        abortSignal,
      });

      const wording = fixupWording(kind);
      if (result.success) return ok(wording.done);
      if (result.error.code === 'CANCELLED' || result.error.code === 'TIMEOUT') {
        return this.describeInterruptedCommit(result.error, wording, (head) =>
          this.isNewCommitOn(head, headBefore.value),
        );
      }
      return err(result.error);
    } finally {
      if (scriptDir) removeEditorScriptDir(scriptDir);
    }
  }

  /** A new commit was made iff HEAD moved and its parent is the HEAD we started from. */
  private async isNewCommitOn(head: string, previousHead: string): Promise<boolean | undefined> {
    if (head === previousHead) return false;
    const parent = await this.executor.execute({
      args: ['rev-parse', '--verify', '--quiet', `${head}^`],
      cwd: this.workspacePath,
    });
    if (!parent.success) return undefined;
    return parent.value.stdout.trim() === previousHead ? true : undefined;
  }

  /**
   * Report what an interrupted commit actually did, by looking rather than
   * assuming.
   *
   * Cancelling and timing out both end our *wait*; neither states the outcome.
   * Hooks run before the commit object is written, so almost always nothing was
   * created — but killing git in the window between the object being written and
   * the process exiting leaves the commit done. "Did my history change or not?"
   * is the worst question to leave a user holding, and an assumption that is
   * wrong one time in a hundred is exactly how they end up holding it. So HEAD
   * is re-read and `wasCompleted` judges it; `undefined` means it cannot tell.
   */
  private async describeInterruptedCommit(
    cause: GitError,
    wording: InterruptedCommitWording,
    wasCompleted: (head: string) => Promise<boolean | undefined>,
  ): Promise<Result<string>> {
    const head = await readHeadHash(this.executor, this.workspacePath);
    const stoppedWaiting =
      cause.code === 'TIMEOUT'
        ? `${capitalize(wording.operation)} did not finish within ${AMEND_TIMEOUT_MS / 1000} seconds, so waiting stopped.`
        : `Waiting for ${wording.operation} was cancelled.`;

    const completed = head.success ? await wasCompleted(head.value) : undefined;

    if (completed === undefined) {
      // We could not look, so we do not claim. Naming the uncertainty beats
      // guessing in either direction.
      return err(
        new GitError(
          `${stoppedWaiting} ${wording.unknown} could not be determined — check the graph after refreshing. ${HOOKS_STILL_RUNNING}`,
          cause.code,
          cause.command
        )
      );
    }

    if (completed) {
      // Observed: the commit object was written before git went away. This is a
      // completed commit, so it is reported as one — the graph must reload and
      // the dialog must close, exactly as on the ordinary success path.
      return ok(`${wording.done} ${stoppedWaiting} ${capitalize(wording.operation)} had already completed. ${HOOKS_STILL_RUNNING}`);
    }

    return err(
      new GitError(
        `${stoppedWaiting} ${wording.notDone} ${HOOKS_STILL_RUNNING}`,
        cause.code,
        cause.command
      )
    );
  }

}

const AMEND_WORDING: InterruptedCommitWording = {
  operation: 'the amend',
  done: 'Commit amended.',
  notDone: 'The commit was not amended.',
  unknown: 'Whether the commit was amended',
};

function fixupWording(kind: FixupCommitKind): InterruptedCommitWording {
  const prefix = FIXUP_KIND_PREFIX[kind];
  return {
    operation: `the ${prefix} commit`,
    done: `Created ${prefix} commit.`,
    notDone: `No ${prefix} commit was created.`,
    unknown: `Whether the ${prefix} commit was created`,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
