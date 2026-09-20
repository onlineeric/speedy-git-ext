import * as path from 'path';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const submoduleHandlers = {
  getSubmodules: async (_message, context) => {
    await context.dataLoader.sendSubmodulesData();
  },

  openSubmodule: async (message, context) => {
    const parentPath = context.runtime.currentRepoPath;
    if (!parentPath) return;
    context.pushSubmoduleEntry({ repoPath: parentPath, repoName: path.basename(parentPath) });
    context.runtime.isDisplayingSubmodule = true;
    const generation = await context.setDisplayedRepo(path.resolve(parentPath, message.payload.submodulePath));
    if (generation !== context.runtime.fetchGeneration) return;
    await context.refreshCoordinator.reload();
  },

  backToParentRepo: async (_message, context) => {
    await context.backToParentRepo();
    await context.refreshCoordinator.reload();
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

  /**
   * An explicit user repository switch. This is the ONE path that moves the
   * saved default, and it moves it for the next first-opened graph only —
   * peer tabs are neither notified nor reloaded.
   */
  switchRepo: async (message, context) => {
    const { repoPath } = message.payload;
    const discovery = context.getRepoDiscovery();
    if (!discovery) return;

    const knownRepo = discovery.getRepos().find((repo) => repo.path === repoPath);
    if (!knownRepo) {
      context.postMessage({ type: 'error', payload: { error: { message: `Repository not found: ${repoPath}` } } });
      return;
    }

    context.runtime.clearBranchFilters();
    const generation = await context.setTopLevelRepo(repoPath);
    context.sendRepoList();
    if (generation !== context.runtime.fetchGeneration) return;
    await context.refreshCoordinator.reload();
  },

  /**
   * Submodule navigation. Never touches the saved default and never notifies
   * another tab: where this tab is looking is this tab's business.
   */
  displayRepo: async (message, context) => {
    const { repoPath } = message.payload;
    const discovery = context.getRepoDiscovery();
    if (!discovery) return;

    context.runtime.clearBranchFilters();
    context.runtime.isDisplayingSubmodule = repoPath !== context.getTopLevelRepoPath();

    const generation = await context.setDisplayedRepo(repoPath);
    if (generation !== context.runtime.fetchGeneration) return;
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
