import { DEFAULT_USER_SETTINGS } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

type WorktreeHandlerContext = Parameters<typeof worktreeHandlers.getWorktreeList>[1];

/** The configured worktree base path, or its default. */
function worktreeBasePath(context: WorktreeHandlerContext): string {
  return context.getSettings()?.worktreeBasePath ?? DEFAULT_USER_SETTINGS.worktreeBasePath;
}

/**
 * The absolute base directory this repo's worktrees live under, or null.
 *
 * Resolved from an already-fetched worktree list so callers that need both the list
 * and the base dir do not spawn a second `git worktree list`.
 */
async function resolveBaseDir(context: WorktreeHandlerContext): Promise<string | null> {
  const service = context.services.current().gitWorktreeService;
  const list = await service.listWorktrees();
  if (!list.success) return null;
  return service.resolveBaseDir(list.value, worktreeBasePath(context));
}

export const worktreeHandlers = {
  getWorktreeList: async (_message, context) => {
    await postWorktreeList(context);
  },

  resolveWorktreePath: async (message, context) => {
    const result = await context.services.current().gitWorktreeService.resolveWorktreePath(
      {
        ref: message.payload.ref,
        branchMode: message.payload.branchMode,
        newBranchName: message.payload.newBranchName,
      },
      worktreeBasePath(context),
    );
    if (result.success) {
      context.postMessage({
        type: 'worktreePathResolved',
        payload: {
          nestedPath: result.value.nestedPath,
          flatPath: result.value.flatPath,
          hierarchical: result.value.hierarchical,
          requestId: message.payload.requestId,
        },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  getWorktreeEnvFiles: async (message, context) => {
    const result = await context.services.current().gitWorktreeService.detectCopyableEnvFiles();
    context.postMessage({
      type: 'worktreeEnvFiles',
      payload: {
        requestId: message.payload.requestId,
        ignoredEnvFiles: result.success ? result.value.ignoredEnvFiles : [],
        envFilesPresent: result.success ? result.value.envFilesPresent : false,
      },
    });
  },

  addWorktree: async (message, context) => {
    const worktreeService = context.services.current().gitWorktreeService;
    const result = await worktreeService.addWorktree({
      path: message.payload.path,
      ref: message.payload.ref,
      branchMode: message.payload.branchMode,
      newBranchName: message.payload.newBranchName,
      force: message.payload.force,
    });
    if (result.success) {
      // Copy gitignored .env* files into the new worktree if requested. Non-fatal:
      // a copy failure must not turn a successful worktree creation into an error.
      let successMessage = 'Worktree created';
      if (message.payload.copyEnvFiles) {
        const copyResult = await worktreeService.copyIgnoredEnvFilesTo(message.payload.path);
        if (copyResult.success && copyResult.value.skippedNotIgnored.length > 0) {
          // Security note: these files are NOT ignored by the new branch, so copying
          // them would expose secrets as untracked, commit-eligible files. Tell the user.
          successMessage = `Worktree created. Skipped ${copyResult.value.skippedNotIgnored.join(', ')} — the new branch does not git-ignore these, so they were left out to avoid exposing secrets.`;
        }
      }
      context.postMessage({ type: 'success', payload: { message: successMessage } });
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
      baseDir: await resolveBaseDir(context),
    });
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: 'Worktree removed' } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  pruneWorktree: async (_message, context) => {
    const baseDir = await resolveBaseDir(context);
    const result = await context.services.current().gitWorktreeService.pruneWorktrees({ baseDir });
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
  'getWorktreeList' | 'resolveWorktreePath' | 'getWorktreeEnvFiles' | 'addWorktree' | 'removeWorktree' | 'pruneWorktree' | 'openWorktree' | 'revealWorktree'
>;

async function postWorktreeList(context: WorktreeHandlerContext): Promise<void> {
  const service = context.services.current().gitWorktreeService;
  const result = await service.listWorktrees();
  const worktrees = result.success ? result.value : [];
  context.postMessage({
    type: 'worktreeList',
    payload: { worktrees, baseDir: service.resolveBaseDir(worktrees, worktreeBasePath(context)) },
  });
}
