import type { Result } from '../../../shared/errors.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';

export const commitHandlers = {
  getCommitMessage: async (message, context) => {
    const result = await context.services.current().gitCommitService.getCommitMessage(message.payload.hash);
    if (result.success) {
      context.postMessage({
        type: 'commitMessage',
        payload: { hash: message.payload.hash, message: result.value },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  amendCommit: async (message, context) => {
    await runCancellableCommit(context, (abortSignal) =>
      context.services.current().gitCommitService.amendCommit({ ...message.payload, abortSignal }),
    );
  },

  createFixupCommit: async (message, context) => {
    await runCancellableCommit(context, (abortSignal) =>
      context.services.current().gitCommitService.createFixupCommit({ ...message.payload, abortSignal }),
    );
  },

  cancelCommitWait: async (_message, context) => {
    // Ends our wait only. The hook process git spawned keeps running, which is
    // why the reported outcome is observed from HEAD rather than assumed.
    context.runtime.activeCommitController?.abort();
  },

  getGitVersion: async (_message, context) => {
    const version = await context.getGitVersion();
    context.postMessage({ type: 'gitVersion', payload: { version } });
  },
} satisfies Pick<
  RequestHandlerMap,
  'getCommitMessage' | 'amendCommit' | 'createFixupCommit' | 'cancelCommitWait' | 'getGitVersion'
>;

/**
 * Run a commit-writing operation that `cancelCommitWait` can stop waiting on:
 * guard, hold the controller for the duration, then report and reload.
 */
async function runCancellableCommit(
  context: WebviewRequestContext,
  run: (abortSignal: AbortSignal) => Promise<Result<string>>,
): Promise<void> {
  // The webview disables the menu items while an operation is in progress, but
  // its flags are only as fresh as the last refresh — this catches a rebase or
  // revert started in a terminal moments ago. See "Why all four in-progress
  // states are blocked" in specs/amend-idea.md: git itself has no single rule
  // here, and a message-only amend during a conflicted revert silently
  // destroys the revert state. Committing into any paused sequencer operation
  // likewise changes what that operation continues from.
  const operationError = await context.operationGuard.getOperationInProgressError();
  if (operationError) {
    context.postMessage({ type: 'error', payload: { error: operationError } });
    return;
  }

  const controller = new AbortController();
  context.runtime.activeCommitController = controller;
  try {
    const result = await run(controller.signal);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  } finally {
    if (context.runtime.activeCommitController === controller) {
      context.runtime.activeCommitController = null;
    }
  }
}
