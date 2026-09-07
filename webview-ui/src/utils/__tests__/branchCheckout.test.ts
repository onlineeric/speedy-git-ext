import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Branch, RefInfo, WorktreeInfo } from '@shared/types';
import { decideBranchCheckout, requestBranchCheckout } from '../branchCheckout';
import { useGraphStore } from '../../stores/graphStore';
import { rpcClient } from '../../rpc/rpcClient';

const local: RefInfo = { type: 'branch', name: 'feature' };
const remote: RefInfo = { type: 'remote', name: 'feature', remote: 'upstream' };
const branches: Branch[] = [
  { name: 'main', current: true, hash: 'main' },
  { name: 'feature', current: false, hash: 'local' },
  { name: 'feature', remote: 'upstream', current: false, hash: 'remote' },
];

describe('branch checkout choices', () => {
  it('switches a local/combined badge without a pull dialog on double-click', () => {
    expect(decideBranchCheckout(local, branches, 'doubleClick')).toBe('local');
  });

  it('keeps the menu pull dialog for that same local badge', () => {
    expect(decideBranchCheckout(local, branches, 'menu')).toBe('dialog');
  });

  it('shows the existing dialog for a remote badge with a diverged local counterpart', () => {
    expect(decideBranchCheckout(remote, branches, 'doubleClick')).toBe('dialog');
  });

  it('creates tracking only when there is no local counterpart', () => {
    expect(decideBranchCheckout(remote, branches.filter((b) => b.remote), 'doubleClick')).toBe('tracking');
  });

  it('ignores the current local branch but lets its separate remote badge offer pull', () => {
    const current = branches.map((b) => ({ ...b, current: !b.remote && b.name === 'feature' }));
    expect(decideBranchCheckout(local, current, 'doubleClick')).toBe('ignore');
    expect(decideBranchCheckout(remote, current, 'doubleClick')).toBe('dialog');
  });

  it.each(['tag', 'stash', 'head'] as const)('does not checkout a %s badge', (type) => {
    expect(decideBranchCheckout({ name: 'feature', type }, branches, 'doubleClick')).toBe('ignore');
  });
});

describe('branch checkout interaction and RPC lifecycle', () => {
  const send = vi.spyOn(rpcClient, 'send').mockImplementation(() => {});
  beforeEach(() => {
    send.mockClear();
    useGraphStore.setState({
      branches, displayedRepoPath: '/repo', loading: false, isLoadingRepo: false,
      rebaseInProgress: false, cherryPickInProgress: false, revertInProgress: false, mergeInProgress: false,
      activeBranchCheckout: null, checkoutDialog: null, pendingCheckout: null, checkoutWorktree: null,
      worktreeList: [], error: undefined,
    });
  });

  it('works before opening a menu and sends only one checkout for repeated double-clicks', () => {
    requestBranchCheckout(local, 'doubleClick');
    requestBranchCheckout(local, 'doubleClick');
    const requests = send.mock.calls.filter(([request]) => request.type === 'checkoutBranch');
    expect(requests).toHaveLength(1);
    expect(requests[0][0]).toEqual({ type: 'checkoutBranch', payload: {
      name: 'feature', repoPath: '/repo', requestId: expect.any(Number),
    } });
    expect(send).toHaveBeenCalledWith({ type: 'trackUiEvent', payload: { event: {
      kind: 'uiInteraction', surface: 'branchBadge', action: 'checkoutDoubleClick',
    } } });
  });

  it('owns the pull choice in global state, without sending checkout yet', () => {
    requestBranchCheckout(remote, 'doubleClick');
    expect(useGraphStore.getState().checkoutDialog).toEqual({ name: 'feature', repoPath: '/repo' });
    expect(send.mock.calls.some(([request]) => request.type === 'checkoutBranch')).toBe(false);
  });

  it('offers worktree navigation even for a branch held by the main worktree', () => {
    const worktree = { path: '/main', branch: 'refs/heads/feature', isCurrent: false, isMain: true } as WorktreeInfo;
    useGraphStore.setState({ worktreeList: [worktree] });
    requestBranchCheckout(local, 'doubleClick');
    expect(useGraphStore.getState().checkoutWorktree).toBe(worktree);
    expect(useGraphStore.getState().activeBranchCheckout).toBeNull();
  });

  it.each(['rebaseInProgress', 'cherryPickInProgress', 'revertInProgress', 'mergeInProgress'] as const)(
    'refuses checkout while %s', (state) => {
      useGraphStore.setState({ [state]: true });
      requestBranchCheckout(local, 'doubleClick');
      expect(send).not.toHaveBeenCalled();
      expect(useGraphStore.getState().error).toContain('Finish');
    },
  );

  it('retains remote recovery after completion and ignores unrelated completions', () => {
    rpcClient.checkoutBranch({ name: 'feature', remote: 'upstream', repoPath: '/repo' });
    const request = useGraphStore.getState().activeBranchCheckout!;
    rpcClient['handleMessage']({ type: 'branchCheckoutFinished', payload: { requestId: -1 } });
    expect(useGraphStore.getState().activeBranchCheckout).toBe(request);
    rpcClient['handleMessage']({ type: 'checkoutNeedsStash', payload: request });
    rpcClient['handleMessage']({ type: 'branchCheckoutFinished', payload: { requestId: request.requestId } });
    expect(useGraphStore.getState().pendingCheckout).toEqual(request);
    expect(useGraphStore.getState().activeBranchCheckout).toBeNull();
    rpcClient.checkoutBranch(request, true);
    expect(send).toHaveBeenLastCalledWith({ type: 'stashAndCheckout', payload: {
      ...request, requestId: expect.any(Number),
    } });
    expect(useGraphStore.getState().activeBranchCheckout?.requestId).not.toBe(request.requestId);
  });

  it('ignores stash recovery from a repo that is no longer displayed', () => {
    rpcClient.checkoutBranch({ name: 'feature', repoPath: '/repo' });
    const request = useGraphStore.getState().activeBranchCheckout!;
    useGraphStore.setState({ displayedRepoPath: '/other' });
    rpcClient['handleMessage']({ type: 'checkoutNeedsStash', payload: request });
    expect(useGraphStore.getState().pendingCheckout).toBeNull();
  });

  it('rejects confirming checkout against another repository', () => {
    rpcClient.checkoutBranch({ name: 'feature', repoPath: '/other' });
    expect(send).not.toHaveBeenCalled();
  });
});
