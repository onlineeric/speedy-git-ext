import { beforeEach, describe, expect, it, vi } from 'vitest';
import { branchCheckoutHandlers } from '../webview/handlers/branchCheckoutHandlers.js';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import type { BranchCheckoutRequest } from '../../shared/types.js';
import { err, GitError, ok } from '../../shared/errors.js';

const target: BranchCheckoutRequest = { name: 'feature', repoPath: '/repo', requestId: 1 };
const conflict = () => err(new GitError('Checkout failed', 'COMMAND_FAILED', undefined,
  'Your local changes to the following files would be overwritten by checkout: file.txt'));

function setup() {
  const checkout = vi.fn().mockResolvedValue(ok('Checked out'));
  const stash = vi.fn().mockResolvedValue(ok('Stashed'));
  const pull = vi.fn().mockResolvedValue(ok('Pulled'));
  const services = { gitBranchService: { checkout }, gitStashService: { stash }, gitRemoteService: { pull } };
  const current = vi.fn(() => services);
  const guard = vi.fn().mockResolvedValue(null);
  const postMessage = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const runtime = new WebviewRuntime('/repo');
  const context = {
    services: { current }, runtime, postMessage,
    operationGuard: { getOperationInProgressError: guard }, refreshCoordinator: { reload },
  } as unknown as WebviewRequestContext;
  return { context, checkout, stash, pull, current, guard, postMessage, reload, runtime };
}

describe('branch checkout execution and recovery', () => {
  let test: ReturnType<typeof setup>;
  beforeEach(() => { test = setup(); });
  const run = (payload = target, stash = false) => stash
    ? branchCheckoutHandlers.stashAndCheckout({ type: 'stashAndCheckout', payload }, test.context)
    : branchCheckoutHandlers.checkoutBranch({ type: 'checkoutBranch', payload }, test.context);

  it('switches without pulling unless explicitly requested and releases the busy state', async () => {
    await run();
    expect(test.checkout).toHaveBeenCalledWith('feature', undefined);
    expect(test.pull).not.toHaveBeenCalled();
    expect(test.reload).toHaveBeenCalledOnce();
    expect(test.runtime.branchCheckoutInProgress).toBe(false);
    expect(test.postMessage).toHaveBeenLastCalledWith({ type: 'branchCheckoutFinished', payload: { requestId: 1 } });
  });

  it.each([false, true])('guards operations before touching checkout or stash (stash=%s)', async (stash) => {
    test.guard.mockResolvedValue(new GitError('Finish rebase', 'OPERATION_IN_PROGRESS'));
    await run(target, stash);
    expect(test.checkout).not.toHaveBeenCalled();
    expect(test.stash).not.toHaveBeenCalled();
    expect(test.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    expect(test.runtime.branchCheckoutInProgress).toBe(false);
  });

  it('retains the exact remote and repository through a stash-required response', async () => {
    test.checkout.mockResolvedValue(conflict());
    const remoteTarget = { ...target, remote: 'upstream' };
    await run(remoteTarget);
    expect(test.postMessage).toHaveBeenCalledWith({ type: 'checkoutNeedsStash', payload: remoteTarget });
    test.checkout.mockResolvedValue(ok('Checked out'));
    await run({ ...remoteTarget, requestId: 2 }, true);
    expect(test.stash).toHaveBeenCalledOnce();
    expect(test.checkout).toHaveBeenLastCalledWith('feature', 'upstream');
  });

  it('explains untracked collisions without offering a stash that cannot resolve them', async () => {
    test.checkout.mockResolvedValue(err(new GitError('Failed', 'COMMAND_FAILED', undefined,
      'The following untracked working tree files would be overwritten by checkout: notes.txt')));
    await run();
    expect(test.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'checkoutNeedsStash' }));
    expect(test.postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: expect.objectContaining({
      message: expect.stringContaining('including untracked files'),
    }) } });
  });

  it('keeps the stash and refreshes if the retry fails', async () => {
    test.checkout.mockResolvedValue(conflict());
    await run(target, true);
    expect(test.postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: expect.objectContaining({
      message: expect.stringContaining('Your stash has been kept'),
    }) } });
    expect(test.reload).toHaveBeenCalledOnce();
    expect(test.pull).not.toHaveBeenCalled();
  });

  it('does not checkout after a failed stash', async () => {
    test.stash.mockResolvedValue(err(new GitError('Stash failed', 'COMMAND_FAILED')));
    await run(target, true);
    expect(test.checkout).not.toHaveBeenCalled();
  });

  it('reports checkout success separately from pull failure', async () => {
    test.pull.mockResolvedValue(err(new GitError('Offline', 'COMMAND_FAILED')));
    await run({ ...target, pull: true });
    expect(test.postMessage).toHaveBeenCalledWith({ type: 'checkoutPullFailed', payload: {
      branch: 'feature', error: { message: 'Offline', code: 'COMMAND_FAILED' },
    } });
    expect(test.reload).toHaveBeenCalledOnce();
  });

  it('rejects a request from a repository that is no longer displayed', async () => {
    await run({ ...target, repoPath: '/other' }, true);
    expect(test.guard).not.toHaveBeenCalled();
    expect(test.stash).not.toHaveBeenCalled();
    expect(test.checkout).not.toHaveBeenCalled();
  });

  it('acquires the checkout lock before awaiting the operation guard', async () => {
    let release!: (value: null) => void;
    test.guard.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const first = run();
    await run({ ...target, requestId: 2 });
    expect(test.guard).toHaveBeenCalledOnce();
    expect(test.runtime.branchCheckoutInProgress).toBe(true);
    release(null);
    await first;
    expect(test.checkout).toHaveBeenCalledOnce();
  });

  it('does not pull, refresh, or offer recovery in a newly selected repository', async () => {
    test.checkout.mockImplementation(async () => {
      test.runtime.beginNavigation();
      test.runtime.resetRepoScopedState('/other');
      return conflict();
    });
    await run({ ...target, pull: true });
    expect(test.pull).not.toHaveBeenCalled();
    expect(test.reload).not.toHaveBeenCalled();
    expect(test.postMessage.mock.calls).toEqual([[{ type: 'branchCheckoutFinished', payload: { requestId: 1 } }]]);
  });

  it('does not checkout if navigation starts while stashing', async () => {
    test.stash.mockImplementation(async () => {
      test.runtime.beginNavigation();
      return ok('Stashed');
    });
    await run(target, true);
    expect(test.checkout).not.toHaveBeenCalled();
  });

  it('releases the lock and finishes even on an unexpected exception', async () => {
    test.checkout.mockRejectedValue(new Error('Unexpected failure'));
    await expect(run()).rejects.toThrow('Unexpected failure');
    expect(test.runtime.branchCheckoutInProgress).toBe(false);
    expect(test.postMessage).toHaveBeenLastCalledWith({ type: 'branchCheckoutFinished', payload: { requestId: 1 } });
  });
});
