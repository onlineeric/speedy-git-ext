import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

/**
 * The controller for the amend currently in flight, if any.
 *
 * Module-level for the same reason `compareHandlers` keeps its compare
 * controller in the runtime: `cancelAmend` arrives as its own message, so the
 * thing it cancels has to outlive the dispatch that started it. Only one amend
 * can be running — the dialog is modal and there is only one HEAD.
 */
let activeAmendController: AbortController | null = null;

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
    // The webview disables the menu item while an operation is in progress, but
    // its flags are only as fresh as the last refresh — this catches a rebase or
    // revert started in a terminal moments ago. See "Why all four in-progress
    // states are blocked" in specs/amend-idea.md: git itself has no single rule
    // here, and a message-only amend during a conflicted revert silently
    // destroys the revert state.
    const operationError = await context.operationGuard.getOperationInProgressError();
    if (operationError) {
      context.postMessage({ type: 'error', payload: { error: operationError } });
      return;
    }

    const controller = new AbortController();
    activeAmendController = controller;
    try {
      const result = await context.services.current().gitCommitService.amendCommit({
        message: message.payload.message,
        includeStaged: message.payload.includeStaged,
        expectedHead: message.payload.expectedHead,
        abortSignal: controller.signal,
      });

      if (result.success) {
        context.postMessage({ type: 'success', payload: { message: result.value } });
        await context.refreshCoordinator.reload();
      } else {
        context.postMessage({ type: 'error', payload: { error: result.error } });
      }
    } finally {
      if (activeAmendController === controller) activeAmendController = null;
    }
  },

  cancelAmend: async (_message, _context) => {
    // Ends our wait only. The hook process git spawned keeps running, which is
    // why the reported outcome is observed from HEAD rather than assumed.
    activeAmendController?.abort();
  },
} satisfies Pick<RequestHandlerMap, 'getCommitMessage' | 'amendCommit' | 'cancelAmend'>;
