import { GitError } from '../../../shared/errors.js';
import type { BranchCheckoutRequest } from '../../../shared/types.js';
import { isCheckoutConflict } from '../../services/GitBranchService.js';
import { gitErrorDetail } from '../../utils/gitParsers.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';

export const branchCheckoutHandlers = {
  checkoutBranch: (message, context) => checkout(message.payload, context, false),
  stashAndCheckout: (message, context) => checkout(message.payload, context, true),
} satisfies Pick<RequestHandlerMap, 'checkoutBranch' | 'stashAndCheckout'>;

/** One execution/recovery path for menu and double-click checkout. */
async function checkout(target: BranchCheckoutRequest, context: WebviewRequestContext, stash: boolean): Promise<void> {
  const { runtime } = context;
  const finish = () => context.postMessage({ type: 'branchCheckoutFinished', payload: { requestId: target.requestId } });
  if (target.repoPath !== runtime.currentRepoPath || runtime.branchCheckoutInProgress) {
    context.postMessage({ type: 'error', payload: { error: new GitError(
      'The repository changed or another checkout is running. Try again when it finishes.', 'OPERATION_IN_PROGRESS',
    ) } });
    finish();
    return;
  }

  // Acquire before the first await. Git's index lock alone does not serialize
  // a sequence of stash, checkout, pull, and refresh.
  runtime.branchCheckoutInProgress = true;
  const services = context.services.current();
  const generation = runtime.fetchGeneration;
  const isCurrent = () => context.services.current() === services && runtime.fetchGeneration === generation;
  try {
    const operationError = await context.operationGuard.getOperationInProgressError();
    if (!isCurrent()) return;
    if (operationError) {
      context.postMessage({ type: 'error', payload: { error: operationError } });
      return;
    }

    if (stash) {
      const result = await services.gitStashService.stash();
      if (!isCurrent()) return;
      if (!result.success) {
        context.postMessage({ type: 'error', payload: { error: result.error } });
        return;
      }
    }

    const result = await services.gitBranchService.checkout(target.name, target.remote);
    if (!isCurrent()) return;
    if (!result.success) {
      const untracked = gitErrorDetail(result.error).includes('untracked working tree files would be overwritten');
      if (!stash && isCheckoutConflict(result.error) && !untracked) {
        context.postMessage({ type: 'checkoutNeedsStash', payload: target });
        return;
      }
      const explanation = [
        stash ? 'Checkout failed after stashing. Your stash has been kept.' : '',
        untracked ? 'Untracked files block checkout. Move or stash them including untracked files, then try again.' : '',
      ].filter(Boolean).join(' ');
      context.postMessage({ type: 'error', payload: { error: explanation
        ? new GitError(`${explanation}\n${result.error.message}`, result.error.code)
        : result.error } });
      // Refresh stale badges and show the new stash even when checkout failed.
      await context.refreshCoordinator.reload();
      return;
    }

    if (target.pull) {
      // Keep the original services throughout; never pull a newly selected repo.
      const pull = await services.gitRemoteService.pull();
      if (!isCurrent()) return;
      if (!pull.success) {
        context.postMessage({ type: 'checkoutPullFailed', payload: {
          branch: target.name, error: { message: pull.error.message, code: pull.error.code },
        } });
        await context.refreshCoordinator.reload();
        return;
      }
    }
    context.postMessage({ type: 'success', payload: { message: result.value } });
    await context.refreshCoordinator.reload();
  } finally {
    runtime.branchCheckoutInProgress = false;
    finish();
  }
}
