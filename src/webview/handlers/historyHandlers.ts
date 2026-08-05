import type { RebaseAction } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

// No pre-flight working-tree check guards the rebase paths below. `git rebase` enforces
// its own precondition (any staged or unstaged tracked change; untracked files are fine)
// and its error names what is in the way, so a check here could only be wrong in one
// direction — refusing work git would have done.

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
    if (await postOperationInProgress(context)) return;
    const rebaseResult = await context.services.current().gitRebaseService.rebase(message.payload.targetRef, message.payload.ignoreDate);
    await postRebaseResult(context, rebaseResult);
  },

  interactiveRebase: async (message, context) => {
    if (await postOperationInProgress(context)) return;
    const result = await context.services.current().gitRebaseService.interactiveRebase(message.payload.config);
    await postRebaseResult(context, result);
  },

  getRebaseCommits: async (message, context) => {
    // A plain `git log` read with no precondition of its own — never gate opening the
    // interactive rebase dialog on working-tree state.
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

/**
 * Refuse to *start* a rebase while another sequencer operation is already running,
 * the same way `revert` and `dropCommit` do — this is git's own rule, not one of ours.
 *
 * Without it, `git rebase` fails with "there is already a rebase-merge directory",
 * which `GitRebaseService.isRebaseConflict` reads as a conflict because that directory
 * exists — so the user is told to resolve conflicts and continue, and an interactive
 * rebase additionally overwrites the paused rebase's temp script directory, breaking
 * its reword/squash messages on Continue.
 *
 * Returns true when the operation was refused and the caller must stop.
 */
async function postOperationInProgress(
  context: Parameters<typeof historyHandlers.rebase>[1],
): Promise<boolean> {
  const operationError = await context.operationGuard.getOperationInProgressError();
  if (!operationError) return false;
  // Error only — no `rebaseState: idle`. The guard fires precisely when an operation
  // is still running, so declaring the rebase idle here would tear down the
  // conflict-resolution UI the user still needs. `dropCommit` does the same.
  context.postMessage({ type: 'error', payload: { error: operationError } });
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
