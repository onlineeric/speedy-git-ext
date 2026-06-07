import { DEFAULT_USER_SETTINGS } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const worktreeHandlers = {
  getWorktreeList: async (_message, context) => {
    await postWorktreeList(context);
  },

  resolveWorktreePath: async (message, context) => {
    const basePath = context.getSettings()?.worktreeBasePath ?? DEFAULT_USER_SETTINGS.worktreeBasePath;
    const result = await context.services.current().gitWorktreeService.resolveWorktreePath(
      {
        ref: message.payload.ref,
        branchMode: message.payload.branchMode,
        newBranchName: message.payload.newBranchName,
      },
      basePath,
    );
    if (result.success) {
      context.postMessage({
        type: 'worktreePathResolved',
        payload: { path: result.value.path, requestId: message.payload.requestId },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  addWorktree: async (message, context) => {
    const result = await context.services.current().gitWorktreeService.addWorktree({
      path: message.payload.path,
      ref: message.payload.ref,
      branchMode: message.payload.branchMode,
      newBranchName: message.payload.newBranchName,
      force: message.payload.force,
    });
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: 'Worktree created' } });
      await context.refreshCoordinator.reload();
      await context.editorCommands.openWorktreeFolder(message.payload.path);
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  removeWorktree: async (message, context) => {
    const guard = await context.editorCommands.findRemovableWorktree(message.payload.path);
    if (!guard.success) {
      context.postMessage({ type: 'error', payload: { error: guard.error } });
      return;
    }
    const result = await context.services.current().gitWorktreeService.removeWorktree(message.payload.path, {
      force: message.payload.force,
    });
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: 'Worktree removed' } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  pruneWorktree: async (_message, context) => {
    const result = await context.services.current().gitWorktreeService.pruneWorktrees();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: 'Worktrees pruned' } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  openWorktree: async (message, context) => {
    await context.editorCommands.openWorktreeFolder(message.payload.path);
  },

  revealWorktree: async (message, context) => {
    await context.editorCommands.revealWorktree(message.payload.path);
  },
} satisfies Pick<
  RequestHandlerMap,
  'getWorktreeList' | 'resolveWorktreePath' | 'addWorktree' | 'removeWorktree' | 'pruneWorktree' | 'openWorktree' | 'revealWorktree'
>;

async function postWorktreeList(context: Parameters<typeof worktreeHandlers.getWorktreeList>[1]): Promise<void> {
  const result = await context.services.current().gitWorktreeService.listWorktrees();
  context.postMessage({
    type: 'worktreeList',
    payload: { worktrees: result.success ? result.value : [] },
  });
}
