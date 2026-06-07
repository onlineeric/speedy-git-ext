import type { RebaseAction } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

const dirtyRebaseMessage = 'Working tree has uncommitted changes. Commit, stash, or discard them before rebasing.';

export const historyHandlers = {
  resetBranch: async (message, context) => {
    const result = await context.services.current().gitHistoryService.reset(
      message.payload.hash,
      message.payload.mode,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  cherryPick: async (message, context) => {
    const result = await context.services.current().gitCherryPickService.cherryPick(
      message.payload.hashes,
      message.payload.options,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
    } else if (result.error.code === 'CHERRY_PICK_CONFLICT') {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({ type: 'cherryPickState', payload: { state: 'in-progress' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  abortCherryPick: async (_message, context) => {
    const result = await context.services.current().gitCherryPickService.abortCherryPick();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  continueCherryPick: async (_message, context) => {
    const result = await context.services.current().gitCherryPickService.continueCherryPick();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'cherryPickState', payload: { state: 'idle' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({ type: 'cherryPickState', payload: { state: 'in-progress' } });
    }
  },

  getCommitParents: async (message, context) => {
    const parentsResult = await context.services.current().gitHistoryService.getCommitParents(message.payload.hashes);
    if (parentsResult.success) {
      context.postMessage({ type: 'commitParents', payload: { parents: parentsResult.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: parentsResult.error } });
    }
  },

  revert: async (message, context) => {
    const operationError = await context.operationGuard.getOperationInProgressError();
    if (operationError) {
      context.postMessage({ type: 'error', payload: { error: operationError } });
      context.postMessage({ type: 'revertState', payload: { state: 'idle' } });
      return;
    }
    const result = await context.services.current().gitRevertService.revert(message.payload.hash, message.payload.options);
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'revertState', payload: { state: 'idle' } });
    } else if (result.error.code === 'REVERT_CONFLICT') {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({ type: 'revertState', payload: { state: 'in-progress' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({ type: 'revertState', payload: { state: 'idle' } });
    }
  },

  continueRevert: async (_message, context) => {
    const result = await context.services.current().gitRevertService.continueRevert();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'revertState', payload: { state: 'idle' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      context.postMessage({ type: 'revertState', payload: { state: 'in-progress' } });
    }
  },

  abortRevert: async (_message, context) => {
    const result = await context.services.current().gitRevertService.abortRevert();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'revertState', payload: { state: 'idle' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  rebase: async (message, context) => {
    if (!(await ensureCleanForRebase(context))) return;
    const rebaseResult = await context.services.current().gitRebaseService.rebase(message.payload.targetRef, message.payload.ignoreDate);
    await postRebaseResult(context, rebaseResult);
  },

  interactiveRebase: async (message, context) => {
    if (!(await ensureCleanForRebase(context))) return;
    const result = await context.services.current().gitRebaseService.interactiveRebase(message.payload.config);
    await postRebaseResult(context, result);
  },

  getRebaseCommits: async (message, context) => {
    if (!(await ensureCleanForRebase(context, false))) return;
    const commitsResult = await context.services.current().gitRebaseService.getRebaseCommits(message.payload.baseHash);
    if (commitsResult.success) {
      context.postMessage({ type: 'rebaseCommits', payload: { entries: commitsResult.value } });
    } else {
      context.postMessage({ type: 'error', payload: { error: commitsResult.error } });
    }
  },

  abortRebase: async (_message, context) => {
    const abortResult = await context.services.current().gitRebaseService.abortRebase();
    if (abortResult.success) {
      context.postMessage({ type: 'success', payload: { message: abortResult.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
    } else {
      context.postMessage({ type: 'error', payload: { error: abortResult.error } });
    }
  },

  continueRebase: async (_message, context) => {
    const continueResult = await context.services.current().gitRebaseService.continueRebase();
    if (continueResult.success) {
      context.postMessage({ type: 'success', payload: { message: continueResult.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
    } else if (continueResult.error.code === 'REBASE_CONFLICT') {
      context.postMessage({ type: 'error', payload: { error: continueResult.error } });
      const conflictInfo = await context.services.current().gitRebaseService.getConflictInfo();
      context.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
    } else {
      context.postMessage({ type: 'error', payload: { error: continueResult.error } });
    }
  },

  isCommitPushed: async (message, context) => {
    const result = await context.services.current().gitHistoryService.isCommitPushed(message.payload.hash);
    if (result.success) {
      context.postMessage({
        type: 'commitPushedResult',
        payload: { hash: message.payload.hash, pushed: result.value },
      });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  dropCommit: async (message, context) => {
    const operationError = await context.operationGuard.getOperationInProgressError();
    if (operationError) {
      context.postMessage({ type: 'error', payload: { error: operationError } });
      return;
    }

    const dirtyCheck = await context.services.current().gitRebaseService.isDirtyWorkingTree();
    if (!dirtyCheck.success) {
      context.postMessage({ type: 'error', payload: { error: dirtyCheck.error } });
      return;
    }
    if (dirtyCheck.value) {
      context.postMessage({ type: 'error', payload: { error: { message: 'Working tree has uncommitted changes. Commit, stash, or discard them before dropping a commit.' } } });
      return;
    }

    const dropBaseHash = `${message.payload.hash}~1`;
    const commitsResult = await context.services.current().gitRebaseService.getRebaseCommits(dropBaseHash);
    if (!commitsResult.success) {
      context.postMessage({ type: 'error', payload: { error: commitsResult.error } });
      return;
    }

    const entries = commitsResult.value.map((entry) => ({
      ...entry,
      action: (entry.hash === message.payload.hash ? 'drop' : 'pick') as RebaseAction,
    }));
    const result = await context.services.current().gitRebaseService.interactiveRebase({
      baseHash: dropBaseHash,
      entries,
      squashMessages: [],
    });
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: `Dropped ${message.payload.hash.slice(0, 7)} from the current branch.` } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
    } else if (result.error.code === 'REBASE_CONFLICT') {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      const conflictInfo = await context.services.current().gitRebaseService.getConflictInfo();
      context.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<
  RequestHandlerMap,
  | 'resetBranch'
  | 'cherryPick'
  | 'abortCherryPick'
  | 'continueCherryPick'
  | 'getCommitParents'
  | 'revert'
  | 'continueRevert'
  | 'abortRevert'
  | 'rebase'
  | 'interactiveRebase'
  | 'getRebaseCommits'
  | 'abortRebase'
  | 'continueRebase'
  | 'isCommitPushed'
  | 'dropCommit'
>;

async function ensureCleanForRebase(
  context: Parameters<typeof historyHandlers.rebase>[1],
  postIdleState = true,
): Promise<boolean> {
  const dirtyCheck = await context.services.current().gitRebaseService.isDirtyWorkingTree();
  if (!dirtyCheck.success) {
    context.postMessage({ type: 'error', payload: { error: dirtyCheck.error } });
    if (postIdleState) {
      context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
    }
    return false;
  }
  if (dirtyCheck.value) {
    context.postMessage({ type: 'error', payload: { error: { message: dirtyRebaseMessage } } });
    if (postIdleState) {
      context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
    }
    return false;
  }
  return true;
}

async function postRebaseResult(
  context: Parameters<typeof historyHandlers.rebase>[1],
  result: Awaited<ReturnType<ReturnType<typeof context.services.current>['gitRebaseService']['rebase']>>,
): Promise<void> {
  if (result.success) {
    context.postMessage({ type: 'success', payload: { message: result.value } });
    await context.refreshCoordinator.reload();
    context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
  } else if (result.error.code === 'REBASE_CONFLICT') {
    context.postMessage({ type: 'error', payload: { error: result.error } });
    const conflictInfo = await context.services.current().gitRebaseService.getConflictInfo();
    context.postMessage({ type: 'rebaseState', payload: { state: 'in-progress', conflictInfo: conflictInfo.success ? conflictInfo.value : undefined } });
  } else {
    context.postMessage({ type: 'error', payload: { error: result.error } });
    context.postMessage({ type: 'rebaseState', payload: { state: 'idle' } });
  }
}
