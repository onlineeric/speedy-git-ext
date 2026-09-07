import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { buildStashAndCheckoutCommand } from '../utils/gitCommandBuilder';
import { trackUiInteraction } from '../utils/telemetry';
import { CheckoutWithPullDialog } from './CheckoutWithPullDialog';
import { ConfirmDialog } from './ConfirmDialog';

/** One owner survives row virtualization, unopened menus, and overflow popovers. */
export function BranchCheckoutDialogs() {
  const target = useGraphStore((s) => s.checkoutDialog);
  const pending = useGraphStore((s) => s.pendingCheckout);
  const worktree = useGraphStore((s) => s.checkoutWorktree);
  const repoPath = useGraphStore((s) => s.displayedRepoPath);
  const busy = useGraphStore((s) => s.isLoadingRepo || s.activeBranchCheckout !== null);
  const upstream = useGraphStore((s) => s.branches.find((b) => !b.remote && b.name === target?.name)?.upstream);

  return (
    <>
      {target && target.repoPath === repoPath && !busy && (
        <CheckoutWithPullDialog
          open
          branchName={target.name}
          upstream={upstream}
          onConfirm={(pull) => {
            useGraphStore.setState({ checkoutDialog: null });
            rpcClient.checkoutBranch({ ...target, pull });
          }}
          onCancel={() => useGraphStore.setState({ checkoutDialog: null })}
        />
      )}
      {pending && pending.repoPath === repoPath && !busy && (
        <ConfirmDialog
          open
          title="Stash Changes"
          description={`Stash tracked changes and checkout '${pending.name}'? The stash is kept for you to apply later. Untracked files are not included.`}
          onConfirm={() => {
            useGraphStore.setState({ pendingCheckout: null });
            rpcClient.checkoutBranch(pending, true);
          }}
          onCancel={() => useGraphStore.setState({ pendingCheckout: null })}
          telemetryId="stashAndCheckout"
          confirmLabel="Stash & Checkout"
          variant="warning"
          commandPreview={buildStashAndCheckoutCommand({ branch: pending.name, remote: pending.remote, pull: pending.pull ?? false })}
        />
      )}
      {worktree && !busy && (
        <ConfirmDialog
          open
          title="Branch Already in Use"
          description={`This branch is checked out in '${worktree.path}'. Open that worktree in another window?`}
          onConfirm={() => {
            useGraphStore.setState({ checkoutWorktree: null });
            trackUiInteraction('branchBadge', 'openWorktree');
            rpcClient.openWorktree(worktree.path);
          }}
          onCancel={() => useGraphStore.setState({ checkoutWorktree: null })}
          telemetryId="checkoutWorktree"
          confirmLabel="Open Worktree"
        />
      )}
    </>
  );
}
