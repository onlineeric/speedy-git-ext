import type { Branch, BranchCheckoutTarget, RefInfo } from '@shared/types';
import { hasRemoteCounterpart } from './commitMenuAvailability';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from './telemetry';

type CheckoutGesture = 'menu' | 'doubleClick';
type CheckoutDecision = 'ignore' | 'dialog' | 'local' | 'tracking';

export function getBranchCheckoutState(ref: RefInfo, branches: readonly Branch[]): 'local-only' | 'remote-only' | 'dual' {
  if (ref.type === 'branch') return hasRemoteCounterpart(branches, ref.name) ? 'dual' : 'local-only';
  if (ref.type === 'remote' && ref.remote) {
    return branches.some((branch) => !branch.remote && branch.name === ref.name) ? 'dual' : 'remote-only';
  }
  return 'local-only';
}

/** Menu checkout preserves its pull choice; double-click skips it for local badges. */
export function decideBranchCheckout(ref: RefInfo, branches: readonly Branch[], gesture: CheckoutGesture): CheckoutDecision {
  if (ref.type !== 'branch' && ref.type !== 'remote') return 'ignore';
  if (ref.type === 'remote' && !ref.remote) return 'ignore';
  const local = branches.find((branch) => !branch.remote && branch.name === ref.name);
  if (ref.type === 'branch' && local?.current) return 'ignore';
  const state = getBranchCheckoutState(ref, branches);
  if (state === 'dual' && (gesture === 'menu' || ref.type === 'remote')) return 'dialog';
  return ref.type === 'remote' ? 'tracking' : 'local';
}

/** Read at interaction time: idle virtualized badges need no store subscriptions. */
export function requestBranchCheckout(ref: RefInfo, gesture: CheckoutGesture): void {
  const store = useGraphStore.getState();
  if (store.loading || store.isLoadingRepo || store.activeBranchCheckout
    || store.checkoutDialog || store.pendingCheckout || store.checkoutWorktree) return;
  const decision = decideBranchCheckout(ref, store.branches, gesture);
  if (decision === 'ignore') return;
  if (store.rebaseInProgress || store.cherryPickInProgress || store.revertInProgress || store.mergeInProgress) {
    store.setError('Finish the current Git operation before switching branches.');
    return;
  }
  trackUiInteraction(gesture === 'doubleClick' ? 'branchBadge' : ref.remote ? 'remoteBranchMenu' : 'branchMenu',
    gesture === 'doubleClick' ? 'checkoutDoubleClick' : 'checkout');
  // The badge lookup intentionally omits the main worktree; checkout must not.
  const worktree = store.worktreeList.find((item) => item.branch === `refs/heads/${ref.name}` && !item.isCurrent);
  if (worktree && !worktree.isCurrent) {
    useGraphStore.setState({ checkoutWorktree: worktree });
    return;
  }
  const target: BranchCheckoutTarget = {
    name: ref.name, repoPath: store.displayedRepoPath,
    ...(decision === 'tracking' ? { remote: ref.remote } : {}),
  };
  if (decision === 'dialog') {
    useGraphStore.setState({ checkoutDialog: target });
  } else {
    rpcClient.checkoutBranch(target);
  }
}
