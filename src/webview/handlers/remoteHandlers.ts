import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const remoteHandlers = {
  fetch: async (message, context) => {
    if (message.payload.filters) {
      context.runtime.currentFilters = { maxCount: context.runtime.currentFilters.maxCount, ...message.payload.filters };
    }
    const result = await context.services.current().gitBranchService.fetch(
      message.payload.remote,
      message.payload.prune,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload(message.payload.filters);
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  push: async (message, context) => {
    const result = await context.services.current().gitRemoteService.push(
      message.payload.remote,
      message.payload.branch,
      message.payload.setUpstream,
      message.payload.forceMode,
    );
    if (result.success) {
      context.postMessage({ type: 'pushResult', payload: { success: true, message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'pushResult', payload: { success: false, message: result.error.message } });
    }
  },

  pull: async (message, context) => {
    const result = await context.services.current().gitRemoteService.pull(
      message.payload.remote,
      message.payload.branch,
      message.payload.rebase,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  getRemotes: async (_message, context) => {
    const result = await context.services.current().gitRemoteService.getRemotes();
    if (result.success) {
      context.postMessage({ type: 'remotes', payload: { remotes: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  addRemote: async (message, context) => {
    const services = context.services.current();
    const result = await services.gitRemoteService.addRemote(message.payload.name, message.payload.url);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.services.current().gitBranchService.fetch(message.payload.name);
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  removeRemote: async (message, context) => {
    const result = await context.services.current().gitRemoteService.removeRemote(message.payload.name);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  editRemote: async (message, context) => {
    const result = await context.services.current().gitRemoteService.editRemote(
      message.payload.name,
      message.payload.newUrl,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<
  RequestHandlerMap,
  'fetch' | 'push' | 'pull' | 'getRemotes' | 'addRemote' | 'removeRemote' | 'editRemote'
>;
