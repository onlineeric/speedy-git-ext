import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const tagHandlers = {
  createTag: async (message, context) => {
    const result = await context.services.current().gitTagService.createTag(
      message.payload.name,
      message.payload.hash,
      message.payload.message,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  deleteTag: async (message, context) => {
    const result = await context.services.current().gitTagService.deleteTag(message.payload.name);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  pushTag: async (message, context) => {
    const result = await context.services.current().gitTagService.pushTag(
      message.payload.name,
      message.payload.remote,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<RequestHandlerMap, 'createTag' | 'deleteTag' | 'pushTag'>;
