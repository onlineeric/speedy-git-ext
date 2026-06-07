import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const compareHandlers = {
  compareRefs: async (message, context) => {
    if (context.runtime.activeCompareController) {
      context.runtime.activeCompareController.controller.abort();
    }
    const controller = new AbortController();
    context.runtime.activeCompareController = {
      requestId: message.payload.requestId,
      controller,
    };

    const result = await context.services.current().gitDiffService.compareRefs(
      message.payload.a,
      message.payload.b,
      message.payload.mode,
      controller.signal,
    );

    if (context.runtime.activeCompareController?.requestId === message.payload.requestId) {
      context.runtime.activeCompareController = null;
    }

    if (result.success) {
      context.postMessage({
        type: 'compareResult',
        payload: { requestId: message.payload.requestId, result: result.value },
      });
    } else {
      context.postMessage({
        type: 'compareError',
        payload: { requestId: message.payload.requestId, error: result.error },
      });
    }
  },

  cancelCompare: async (message, context) => {
    const active = context.runtime.activeCompareController;
    if (active && active.requestId === message.payload.requestId) {
      active.controller.abort();
    }
  },

  openCompareDiff: async (message, context) => {
    await context.editorCommands.openCompareDiffEditor(message.payload);
  },
} satisfies Pick<RequestHandlerMap, 'compareRefs' | 'cancelCompare' | 'openCompareDiff'>;
