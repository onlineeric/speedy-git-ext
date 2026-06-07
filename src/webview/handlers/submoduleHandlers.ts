import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const submoduleHandlers = {
  getSubmodules: async (_message, context) => {
    await context.dataLoader.sendSubmodulesData();
  },

  openSubmodule: async (message, context) => {
    const handlers = context.getSubmoduleHandlers();
    if (handlers) {
      await handlers.openSubmodule(message.payload.submodulePath);
      await context.refreshCoordinator.reload();
    }
  },

  backToParentRepo: async (_message, context) => {
    const handlers = context.getSubmoduleHandlers();
    if (handlers) {
      await handlers.backToParentRepo();
      await context.refreshCoordinator.reload();
    }
  },

  updateSubmodule: async (message, context) => {
    const result = await context.services.current().gitSubmoduleService.updateSubmodule(message.payload.submodulePath);
    if (result.success) {
      context.postMessage({ type: 'submoduleOperationResult', payload: { success: true } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({
        type: 'submoduleOperationResult',
        payload: { success: false, error: result.error.message },
      });
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  initSubmodule: async (message, context) => {
    const result = await context.services.current().gitSubmoduleService.initSubmodule(message.payload.submodulePath);
    if (result.success) {
      context.postMessage({ type: 'submoduleOperationResult', payload: { success: true } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({
        type: 'submoduleOperationResult',
        payload: { success: false, error: result.error.message },
      });
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  switchRepo: async (message, context) => {
    const { repoPath } = message.payload;
    const discovery = context.getRepoDiscovery();
    if (!discovery) return;

    const knownRepo = discovery.getRepos().find((repo) => repo.path === repoPath);
    if (!knownRepo) {
      context.postMessage({ type: 'error', payload: { error: { message: `Repository not found: ${repoPath}` } } });
      return;
    }

    const currentGeneration = context.runtime.beginNavigation();
    context.runtime.clearBranchFilters();
    context.runtime.isDisplayingSubmodule = false;

    context.onSwitchRepo(repoPath);
    context.sendRepoList(discovery.getRepos(), discovery.getActiveRepoPath());
    if (currentGeneration !== context.runtime.fetchGeneration) return;
    await context.refreshCoordinator.reload();
  },

  displayRepo: async (message, context) => {
    const { repoPath } = message.payload;
    const discovery = context.getRepoDiscovery();
    if (!discovery) return;

    const currentGeneration = context.runtime.beginNavigation();
    context.runtime.clearBranchFilters();
    context.runtime.isDisplayingSubmodule = repoPath !== discovery.getActiveRepoPath();

    context.onDisplayRepo(repoPath);
    if (currentGeneration !== context.runtime.fetchGeneration) return;
    await context.refreshCoordinator.reload();
  },
} satisfies Pick<
  RequestHandlerMap,
  | 'getSubmodules'
  | 'openSubmodule'
  | 'backToParentRepo'
  | 'updateSubmodule'
  | 'initSubmodule'
  | 'switchRepo'
  | 'displayRepo'
>;
