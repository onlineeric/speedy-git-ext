import { useMemo, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { RefInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { ConfirmDialog } from './ConfirmDialog';
import { InputDialog } from './InputDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';
import { MergeDialog } from './MergeDialog';
import { PushDialog } from './PushDialog';
import { CheckoutWithPullDialog } from './CheckoutWithPullDialog';


interface BranchContextMenuProps {
  refInfo: RefInfo;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';
const dangerItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-errorForeground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

/** Determines whether a branch has local, remote, or both counterparts */
type BranchCheckoutState = 'local-only' | 'remote-only' | 'dual';

function getBranchCheckoutState(refInfo: RefInfo, branches: ReturnType<typeof useGraphStore.getState>['branches']): BranchCheckoutState {
  if (refInfo.type === 'branch') {
    // Local branch — check if there's a matching remote counterpart
    const hasRemote = branches.some((b) => b.remote && b.name === refInfo.name);
    return hasRemote ? 'dual' : 'local-only';
  }
  if (refInfo.type === 'remote' && refInfo.remote) {
    // Remote branch — check if there's a local branch with the same name
    const localName = refInfo.name;
    const hasLocal = branches.some((b) => !b.remote && b.name === localName);
    return hasLocal ? 'dual' : 'remote-only';
  }
  return 'local-only';
}

export function BranchContextMenu({ refInfo, children }: BranchContextMenuProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [checkoutWithPullOpen, setCheckoutWithPullOpen] = useState(false);
  const [rebaseConfirmOpen, setRebaseConfirmOpen] = useState(false);
  const loading = useGraphStore((s) => s.loading);
  const branches = useGraphStore((s) => s.branches);

  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const pendingCheckout = useGraphStore((s) => s.pendingCheckout);
  const pendingForceDeleteBranch = useGraphStore((s) => s.pendingForceDeleteBranch);

  const displayName = refInfo.remote
    ? `${refInfo.remote}/${refInfo.name}`
    : refInfo.name;

  const isRemoteBranch = refInfo.type === 'remote';
  const isLocalBranch = refInfo.type === 'branch';
  const isBranch = isLocalBranch || isRemoteBranch;
  const isTag = refInfo.type === 'tag';
  const isStash = refInfo.type === 'stash';

  // Identify whether this ref is the currently checked-out local branch.
  // displayRefToRefInfo never emits type 'head', so we match by name against the store.
  const headBranch = branches.find((b) => b.current && !b.remote);
  const isCurrentBranch = !!(headBranch && headBranch.name === refInfo.name && !refInfo.remote);

  const checkoutState = useMemo(() => getBranchCheckoutState(refInfo, branches), [refInfo, branches]);

  const handleCheckout = () => {
    if (checkoutState === 'dual') {
      // Local branch with remote counterpart (or remote badge with local counterpart): show pull dialog
      setCheckoutWithPullOpen(true);
    } else if (isRemoteBranch) {
      // Remote-only (no local counterpart): create local tracking branch directly — no dialog
      rpcClient.checkoutBranch(refInfo.name, refInfo.remote);
    } else {
      // Local-only (no remote counterpart): checkout directly — no dialog
      rpcClient.checkoutBranch(refInfo.name);
    }
  };

  const handleCopyName = () => {
    rpcClient.copyToClipboard(displayName);
  };

  // Standard rebase: show for non-current branches that aren't on the HEAD commit
  const targetBranch = branches.find((b) => b.name === refInfo.name && b.remote === refInfo.remote);
  const targetHash = targetBranch?.hash;
  const canRebaseOnto =
    !isCurrentBranch &&
    !rebaseInProgress &&
    !loading &&
    isBranch &&
    !!targetHash &&
    !!headBranch &&
    targetHash !== headBranch.hash;

  const handleRebaseConfirm = (ignoreDate: boolean) => {
    setRebaseConfirmOpen(false);
    useGraphStore.getState().setLoading(true);
    rpcClient.rebase(displayName, ignoreDate);
  };

  // pendingCheckout is for this branch (from checkoutNeedsStash response)
  const stashConfirmOpen = pendingCheckout !== null && pendingCheckout.name === refInfo.name;
  const forceDeleteConfirmOpen = pendingForceDeleteBranch === refInfo.name;

  return (
    <>
      {/* Wrapper stops contextmenu event from bubbling to parent CommitContextMenu */}
      <span onContextMenu={(e) => e.stopPropagation()}>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            {isBranch && !isCurrentBranch && (
              <ContextMenu.Item className={menuItemClass} onSelect={handleCheckout}>
                Checkout {refInfo.name}
              </ContextMenu.Item>
            )}

            {canRebaseOnto && (
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => setRebaseConfirmOpen(true)}
              >
                Rebase Current Branch onto This
              </ContextMenu.Item>
            )}

            {isLocalBranch && (
              <>
                {!isCurrentBranch && (
                  <ContextMenu.Item className={menuItemClass} onSelect={() => setMergeDialogOpen(true)}>
                    Merge into Current Branch
                  </ContextMenu.Item>
                )}
                <ContextMenu.Item className={menuItemClass} onSelect={() => setRenameOpen(true)}>
                  Rename Branch...
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItemClass} onSelect={() => setPushDialogOpen(true)}>
                  Push Branch
                </ContextMenu.Item>
                {isCurrentBranch && (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => rpcClient.pull()}
                    disabled={loading}
                  >
                    Pull Branch
                  </ContextMenu.Item>
                )}
                {!isCurrentBranch && (
                  <>
                    <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
                    <ContextMenu.Item className={dangerItemClass} onSelect={() => setDeleteConfirmOpen(true)}>
                      Delete Branch
                    </ContextMenu.Item>
                  </>
                )}
              </>
            )}

            {isRemoteBranch && refInfo.remote && (
              <>
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
                <ContextMenu.Item className={dangerItemClass} onSelect={() => setDeleteConfirmOpen(true)}>
                  Delete Remote Branch
                </ContextMenu.Item>
              </>
            )}

            {isTag && (
              <>
                <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.pushTag(refInfo.name)}>
                  Push Tag
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
                <ContextMenu.Item className={dangerItemClass} onSelect={() => setDeleteConfirmOpen(true)}>
                  Delete Tag
                </ContextMenu.Item>
              </>
            )}

            {!isStash && (
              <>
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
                <ContextMenu.Item className={menuItemClass} onSelect={handleCopyName}>
                  Copy {isTag ? 'Tag' : 'Branch'} Name
                </ContextMenu.Item>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      </span>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          if (isTag) {
            rpcClient.deleteTag(refInfo.name);
          } else if (isRemoteBranch && refInfo.remote) {
            rpcClient.deleteRemoteBranch(refInfo.remote, refInfo.name);
          } else {
            rpcClient.deleteBranch(refInfo.name);
          }
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        title={isTag ? 'Delete Tag' : isRemoteBranch ? 'Delete Remote Branch' : 'Delete Branch'}
        description={
          isTag
            ? `Are you sure you want to delete tag '${refInfo.name}'?`
            : isRemoteBranch
            ? `Are you sure you want to delete remote branch '${displayName}'? This will remove it from the remote.`
            : `Are you sure you want to delete branch '${refInfo.name}'?`
        }
        confirmLabel="Delete"
        variant="danger"
      />

      <ConfirmDialog
        open={forceDeleteConfirmOpen}
        onConfirm={() => {
          useGraphStore.getState().setPendingForceDeleteBranch(null);
          rpcClient.deleteBranch(refInfo.name, true);
        }}
        onCancel={() => useGraphStore.getState().setPendingForceDeleteBranch(null)}
        title="Force Delete Branch"
        description={`Branch '${refInfo.name}' is not fully merged. Force deleting it may permanently remove unmerged commits from this branch reference. Continue?`}
        confirmLabel="Force Delete"
        variant="danger"
      />

      {/* Rename dialog */}
      <InputDialog
        open={renameOpen}
        onSubmit={(newName) => {
          setRenameOpen(false);
          rpcClient.renameBranch(refInfo.name, newName);
        }}
        onCancel={() => setRenameOpen(false)}
        title="Rename Branch"
        label="New branch name"
        defaultValue={refInfo.name}
        validate={(v) => v.startsWith('-') ? 'Branch name cannot start with -' : undefined}
      />

      {/* Push dialog */}
      <PushDialog
        open={pushDialogOpen}
        branchName={refInfo.name}
        onCancel={() => setPushDialogOpen(false)}
      />

      {/* Merge dialog */}
      <MergeDialog
        open={mergeDialogOpen}
        branchName={refInfo.name}
        onConfirm={(options) => {
          setMergeDialogOpen(false);
          rpcClient.mergeBranch(refInfo.name, options);
        }}
        onCancel={() => setMergeDialogOpen(false)}
      />

      {/* Checkout with pull dialog (dual-branch case) */}
      <CheckoutWithPullDialog
        open={checkoutWithPullOpen}
        branchName={refInfo.name}
        onConfirm={(pull) => {
          setCheckoutWithPullOpen(false);
          rpcClient.checkoutBranchWithPull(refInfo.name, pull);
        }}
        onCancel={() => setCheckoutWithPullOpen(false)}
      />

      {/* Stash-and-checkout dialog (triggered by checkoutNeedsStash response) */}
      <ConfirmDialog
        open={stashConfirmOpen}
        onConfirm={() => {
          const checkout = pendingCheckout;
          useGraphStore.getState().setPendingCheckout(null);
          if (checkout) {
            rpcClient.stashAndCheckout(checkout.name, checkout.pull);
          }
        }}
        onCancel={() => useGraphStore.getState().setPendingCheckout(null)}
        title="Stash Changes"
        description="You have uncommitted changes. Stash them and checkout the branch?"
        confirmLabel="Stash & Checkout"
        variant="warning"
      />

      {/* Rebase confirmation */}
      <RebaseConfirmDialog
        open={rebaseConfirmOpen}
        onConfirm={handleRebaseConfirm}
        onCancel={() => setRebaseConfirmOpen(false)}
        title="Rebase Current Branch"
        description={`Rebase the current branch onto '${displayName}'? This will rewrite commit history. Pushed commits will require a force-push.`}
      />
    </>
  );
}
