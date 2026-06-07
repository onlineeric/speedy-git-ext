import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const stashHandlers = {
  getStashes: async (_message, context) => {
    const result = await context.services.current().gitStashService.getStashes();
    if (result.success) {
      context.postMessage({ type: 'stashes', payload: { stashes: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  applyStash: async (message, context) => {
    const result = await context.services.current().gitStashService.applyStash(message.payload.index);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  popStash: async (message, context) => {
    const result = await context.services.current().gitStashService.popStash(message.payload.index);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  dropStash: async (message, context) => {
    const result = await context.services.current().gitStashService.dropStash(message.payload.index);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  stashWithMessage: async (message, context) => {
    const result = await context.services.current().gitStashService.stashWithMessage(
      message.payload.message,
      message.payload.paths,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  stashSelected: async (message, context) => {
    const result = await context.services.current().gitStashService.stashSelected(
      message.payload.message,
      message.payload.paths,
      message.payload.addUntrackedFirst,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<
  RequestHandlerMap,
  'getStashes' | 'applyStash' | 'popStash' | 'dropStash' | 'stashWithMessage' | 'stashSelected'
>;
