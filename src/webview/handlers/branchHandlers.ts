import * as vscode from 'vscode';
import { isCheckoutConflict } from '../../services/GitBranchService.js';
import type { Result } from '../../../shared/errors.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const branchHandlers = {
  checkoutBranch: async (message, context) => {
    const services = context.services.current();
    const checkoutResult = await services.gitBranchService.checkout(message.payload.name, message.payload.remote);
    if (!checkoutResult.success) {
      if (isCheckoutConflict(checkoutResult.error)) {
        context.postMessage({ type: 'checkoutNeedsStash', payload: { name: message.payload.name, pull: message.payload.pull } });
        return;
      }
      context.postMessage({ type: 'error', payload: { error: checkoutResult.error } });
      return;
    }
    if (message.payload.pull) {
      const pullResult = await context.services.current().gitRemoteService.pull();
      if (!pullResult.success) {
        context.postMessage({
          type: 'checkoutPullFailed',
          payload: {
            branch: message.payload.name,
            error: { message: pullResult.error.message, code: pullResult.error.code },
          },
        });
        await context.refreshCoordinator.reload();
        return;
      }
    }
    context.postMessage({ type: 'success', payload: { message: checkoutResult.value } });
    await context.refreshCoordinator.reload();
  },

  checkoutCommit: async (message, context) => {
    const checkoutResult = await context.services.current().gitBranchService.checkoutCommit(message.payload.hash);
    if (!checkoutResult.success) {
      if (isCheckoutConflict(checkoutResult.error)) {
        context.postMessage({ type: 'checkoutCommitNeedsStash', payload: { hash: message.payload.hash } });
        return;
      }
      context.postMessage({ type: 'error', payload: { error: checkoutResult.error } });
      void vscode.window.showErrorMessage(checkoutResult.error.message);
      return;
    }
    context.postMessage({ type: 'success', payload: { message: checkoutResult.value } });
    await context.refreshCoordinator.reload();
  },

  stashAndCheckout: async (message, context) => {
    const stashResult = await context.services.current().gitStashService.stash();
    if (!stashResult.success) {
      context.postMessage({ type: 'error', payload: { error: stashResult.error } });
      return;
    }
    const checkoutAfterStash = await context.services.current().gitBranchService.checkout(message.payload.name, message.payload.remote);
    if (!checkoutAfterStash.success) {
      context.postMessage({ type: 'error', payload: { error: checkoutAfterStash.error } });
      return;
    }
    if (message.payload.pull) {
      const pullAfterStash = await context.services.current().gitRemoteService.pull();
      if (!pullAfterStash.success) {
        context.postMessage({
          type: 'checkoutPullFailed',
          payload: {
            branch: message.payload.name,
            error: { message: pullAfterStash.error.message, code: pullAfterStash.error.code },
          },
        });
        await context.refreshCoordinator.reload();
        return;
      }
    }
    context.postMessage({ type: 'success', payload: { message: checkoutAfterStash.value } });
    await context.refreshCoordinator.reload();
  },

  stashAndCheckoutCommit: async (message, context) => {
    const stashResult = await context.services.current().gitStashService.stash();
    if (!stashResult.success) {
      context.postMessage({ type: 'error', payload: { error: stashResult.error } });
      return;
    }
    const checkoutAfterStash = await context.services.current().gitBranchService.checkoutCommit(message.payload.hash);
    if (!checkoutAfterStash.success) {
      context.postMessage({ type: 'error', payload: { error: checkoutAfterStash.error } });
      return;
    }
    context.postMessage({ type: 'success', payload: { message: checkoutAfterStash.value } });
    await context.refreshCoordinator.reload();
  },

  fastForwardLocalBranch: async (message, context) => {
    const result = await context.services.current().gitBranchService.fastForwardFromRemote(
      message.payload.remote,
      message.payload.branch,
      message.payload.setUpstream,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  createBranch: async (message, context) => {
    const services = context.services.current();
    const result = await services.gitBranchService.createBranch(
      message.payload.name,
      message.payload.startPoint,
    );
    if (!result.success) {
      context.postMessage({ type: 'error', payload: { error: result.error } });
      return;
    }
    if (message.payload.checkout) {
      const checkoutResult = await context.services.current().gitBranchService.checkout(message.payload.name);
      if (!checkoutResult.success) {
        context.postMessage({
          type: 'error',
          payload: {
            error: {
              message: `Branch '${message.payload.name}' created, but checkout failed: ${checkoutResult.error.message}`,
            },
          },
        });
        await context.refreshCoordinator.reload();
        return;
      }
      context.postMessage({ type: 'success', payload: { message: checkoutResult.value } });
      await context.refreshCoordinator.reload();
      return;
    }
    context.postMessage({ type: 'success', payload: { message: result.value } });
    await context.refreshCoordinator.reload();
  },

  renameBranch: async (message, context) => {
    const result = await context.services.current().gitBranchService.renameBranch(
      message.payload.oldName,
      message.payload.newName,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  deleteBranch: async (message, context) => {
    const result = await context.services.current().gitBranchService.deleteBranch(
      message.payload.name,
      message.payload.force,
    );
    if (result.success) {
      if (message.payload.deleteRemote) {
        const remoteResult = await context.services.current().gitBranchService.deleteRemoteBranch(
          message.payload.deleteRemote.remote,
          message.payload.deleteRemote.name,
        );
        if (!remoteResult.success) {
          context.postMessage({ type: 'error', payload: { error: { message: `Local branch deleted. Remote deletion failed: ${remoteResult.error.message}` } } });
          await context.refreshCoordinator.reload();
          return;
        }
      }
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else if (result.error.code === 'BRANCH_NOT_FULLY_MERGED' && !message.payload.force) {
      context.postMessage({ type: 'deleteBranchNeedsForce', payload: { name: message.payload.name, deleteRemote: message.payload.deleteRemote } });
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  deleteRemoteBranch: async (message, context) => {
    const result = await context.services.current().gitBranchService.deleteRemoteBranch(
      message.payload.remote,
      message.payload.name,
    );
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
    } else {
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },

  mergeBranch: async (message, context) => {
    // Git refuses a merge mid-rebase/cherry-pick/revert/merge anyway, but with a
    // raw plumbing message. The guard answers the same refusal in the wording the
    // rest of the UI uses.
    const operationError = await context.operationGuard.getOperationInProgressError();
    if (operationError) {
      context.postMessage({ type: 'error', payload: { error: operationError } });
      return;
    }
    const result = await context.services.current().gitBranchService.merge(
      message.payload.branch,
      message.payload.noFastForward,
      message.payload.squash,
      message.payload.noCommit,
    );
    await postMergeResult(context, result);
  },

  continueMerge: async (_message, context) => {
    const result = await context.services.current().gitBranchService.continueMerge();
    await postMergeResult(context, result);
  },

  abortMerge: async (_message, context) => {
    const result = await context.services.current().gitBranchService.abortMerge();
    if (result.success) {
      context.postMessage({ type: 'success', payload: { message: result.value } });
      await context.refreshCoordinator.reload();
      context.postMessage({ type: 'mergeState', payload: { state: 'idle' } });
    } else {
      // An abort that fails leaves the merge exactly where it was, so the
      // conflict UI must stay up rather than be torn down.
      context.postMessage({ type: 'error', payload: { error: result.error } });
    }
  },
} satisfies Pick<
  RequestHandlerMap,
  | 'checkoutBranch'
  | 'checkoutCommit'
  | 'stashAndCheckout'
  | 'stashAndCheckoutCommit'
  | 'fastForwardLocalBranch'
  | 'createBranch'
  | 'renameBranch'
  | 'deleteBranch'
  | 'deleteRemoteBranch'
  | 'mergeBranch'
  | 'continueMerge'
  | 'abortMerge'
>;

/**
 * Report the outcome of a merge attempt, and keep `mergeState` in step with it.
 *
 * Start and Continue share this: both either finish the merge, park it in a
 * resolvable conflict, or fail without changing where the merge stands. Only
 * `MERGE_CONFLICT` means git wrote `MERGE_HEAD` and Continue/Abort now apply —
 * `MERGE_CONFLICT_NO_RECOVERY` (a conflicted `--squash`) deliberately does not,
 * because neither command would work on it.
 */
async function postMergeResult(
  context: Parameters<typeof branchHandlers.mergeBranch>[1],
  result: Result<string>,
): Promise<void> {
  if (result.success) {
    context.postMessage({ type: 'success', payload: { message: result.value } });
    await context.refreshCoordinator.reload();
    context.postMessage({ type: 'mergeState', payload: { state: 'idle' } });
    return;
  }
  context.postMessage({ type: 'error', payload: { error: result.error } });
  if (result.error.code === 'MERGE_CONFLICT') {
    context.postMessage({ type: 'mergeState', payload: { state: 'in-progress' } });
    // The conflicted files only appear in the working-tree panel after a reload.
    await context.refreshCoordinator.reload();
  }
}
