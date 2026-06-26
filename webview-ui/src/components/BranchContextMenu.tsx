import { useCallback, useMemo, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { RefInfo, SlotValue } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import {
  buildDeleteRemoteBranchCommand,
  buildDeleteTagCommand,
  buildFastForwardLocalBranchCommand,
  buildRenameBranchCommand,
  buildStashAndCheckoutCommand,
} from '../utils/gitCommandBuilder';
import { resolveDefaultRemote } from '../utils/resolveDefaultRemote';
import { CompareMenuItems } from './CompareMenuItems';
import { ConfirmDialog } from './ConfirmDialog';
import { DeleteBranchDialog } from './DeleteBranchDialog';
import { InputDialog } from './InputDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';
import { MergeDialog } from './MergeDialog';
import { PushDialog } from './PushDialog';
import { CheckoutWithPullDialog } from './CheckoutWithPullDialog';
import { CreateWorktreeDialog, type WorktreeSource } from './CreateWorktreeDialog';
import { useRemoveWorktreeDialog, WorktreeMenuItems } from './WorktreeMenuItems';
import { dangerItemClass, menuContentClass, menuItemClass, menuItemDisabledClass, menuSeparatorClass } from './menuStyles';
import { LazyContextMenu } from './LazyContextMenu';


interface BranchContextMenuProps {
  refInfo: RefInfo;
  children: React.ReactNode;
}

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
  return (
    <LazyContextMenu stopPropagation body={<BranchContextMenuBody refInfo={refInfo} />}>
      {children}
    </LazyContextMenu>
  );
}

function BranchContextMenuBody({ refInfo }: { refInfo: RefInfo }) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [checkoutWithPullOpen, setCheckoutWithPullOpen] = useState(false);
  const [rebaseConfirmOpen, setRebaseConfirmOpen] = useState(false);
  const [fastForwardOpen, setFastForwardOpen] = useState(false);
  const [createWorktreeOpen, setCreateWorktreeOpen] = useState(false);
  const loading = useGraphStore((s) => s.loading);
  const branches = useGraphStore((s) => s.branches);
  const branchWorktree = useGraphStore((s) => refInfo.type === 'branch' ? s.worktreeByBranch.get(refInfo.name) : undefined);
  const { openRemoveWorktreeDialog, removeWorktreeDialog } = useRemoveWorktreeDialog();

  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const cherryPickInProgress = useGraphStore((s) => s.cherryPickInProgress);
  const revertInProgress = useGraphStore((s) => s.revertInProgress);
  const pendingCheckout = useGraphStore((s) => s.pendingCheckout);
  const pendingForceDeleteBranch = useGraphStore((s) => s.pendingForceDeleteBranch);

  const isOperationInProgress = loading || rebaseInProgress || cherryPickInProgress || revertInProgress;

  const displayName = refInfo.remote
    ? `${refInfo.remote}/${refInfo.name}`
    : refInfo.name;

  const isRemoteBranch = refInfo.type === 'remote';
  const isLocalBranch = refInfo.type === 'branch';
  const isBranch = isLocalBranch || isRemoteBranch;
  const isTag = refInfo.type === 'tag';
  const isStash = refInfo.type === 'stash';

  // Compare-refs (042-compare-refs). Stashes are excluded by FR-017.
  const compareSlotForThisRef: SlotValue | null = isBranch
    ? (refInfo.remote ? { kind: 'branch', name: refInfo.name, remote: refInfo.remote } : { kind: 'branch', name: refInfo.name })
    : isTag
      ? { kind: 'tag', name: refInfo.name }
      : null;

  // Identify whether this ref is the currently checked-out local branch.
  // displayRefToRefInfo never emits type 'head', so we match by name against the store.
  const headBranch = branches.find((b) => b.current && !b.remote);
  const isCurrentBranch = !!(headBranch && headBranch.name === refInfo.name && !refInfo.remote);

  const checkoutState = useMemo(() => getBranchCheckoutState(refInfo, branches), [refInfo, branches]);

  // A badge is "merged" when its local and remote counterparts share the same commit hash —
  // visually rendered as a single combined badge by mergeRefs. Fast-forward is meaningless in
  // that case, so the menu item is hidden. When local and remote exist but point to different
  // commits, mergeRefs renders them as separate badges and the menu should appear on both.
  const isMergedBadge = useMemo(() => {
    if (refInfo.type === 'branch') {
      const local = branches.find((b) => !b.remote && b.name === refInfo.name);
      const remote = branches.find((b) => b.remote && b.name === refInfo.name);
      return !!local && !!remote && local.hash === remote.hash;
    }
    if (refInfo.type === 'remote' && refInfo.remote) {
      const remote = branches.find((b) => b.remote === refInfo.remote && b.name === refInfo.name);
      const local = branches.find((b) => !b.remote && b.name === refInfo.name);
      return !!remote && !!local && remote.hash === local.hash;
    }
    return false;
  }, [refInfo, branches]);

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

  // Standard rebase: applicable for non-current branches that aren't on the HEAD commit.
  // Transient busy states (loading/rebase/cherry-pick/revert in progress) only *disable* the
  // item — we keep it visible so the user can see the option exists. Hiding on `loading` was
  // causing the menu item to disappear during the brief getCommits refresh that any filter
  // change triggers, which read as an intermittent bug.
  const targetBranch = branches.find((b) => b.name === refInfo.name && b.remote === refInfo.remote);
  const targetHash = targetBranch?.hash;
  const canRebaseOnto =
    !isCurrentBranch &&
    isBranch &&
    !!targetHash &&
    !!headBranch &&
    targetHash !== headBranch.hash;

  const deleteCommandPreview = useMemo(() => {
    if (isTag) return buildDeleteTagCommand({ name: refInfo.name });
    if (isRemoteBranch && refInfo.remote) return buildDeleteRemoteBranchCommand({ remote: refInfo.remote, name: refInfo.name });
    return '';
  }, [isTag, isRemoteBranch, refInfo.name, refInfo.remote]);

  const buildRenamePreview = useCallback(
    (newName: string) => buildRenameBranchCommand({ oldName: refInfo.name, newName: newName || '<new-name>' }),
    [refInfo.name],
  );

  const stashAndCheckoutPreview = useMemo(() => {
    if (!pendingCheckout) return '';
    return buildStashAndCheckoutCommand({ branch: pendingCheckout.name, pull: pendingCheckout.pull ?? false });
  }, [pendingCheckout]);

  // For remote-only badges, use the badge's own remote; otherwise auto-pick the default remote.
  const fastForwardRemote = useMemo(
    () => (isRemoteBranch && refInfo.remote ? refInfo.remote : resolveDefaultRemote(branches)),
    [isRemoteBranch, refInfo.remote, branches],
  );
  // Only wire up upstream tracking on the remote-only-badge path, where a new
  // local branch is being created and has no pre-existing upstream config.
  // For established local branches, leave any user-configured upstream alone.
  const fastForwardSetUpstream = checkoutState === 'remote-only';
  const fastForwardPreview = useMemo(
    () => buildFastForwardLocalBranchCommand({ remote: fastForwardRemote, branch: refInfo.name, setUpstream: fastForwardSetUpstream }),
    [fastForwardRemote, refInfo.name, fastForwardSetUpstream],
  );

  const handleRebaseConfirm = (ignoreDate: boolean) => {
    setRebaseConfirmOpen(false);
    useGraphStore.getState().setLoading(true);
    rpcClient.rebase(displayName, ignoreDate);
  };

  // Find remote counterpart for local branch (used in delete dialog)
  const remoteBranch = useMemo(() => {
    if (!isLocalBranch) return undefined;
    const remote = branches.find((b) => b.remote && b.name === refInfo.name);
    return remote ? { remote: remote.remote!, name: remote.name } : undefined;
  }, [isLocalBranch, branches, refInfo.name]);

  // Worktree source for "Create worktree…": local branches use the branch name (existing-branch
  // default); remote-only badges base a new tracking branch on `<remote>/<name>` (research R4).
  const worktreeSource = useMemo<WorktreeSource | null>(() => {
    if (isLocalBranch) {
      return { ref: refInfo.name, label: refInfo.name, kind: 'local-branch' };
    }
    if (isRemoteBranch && refInfo.remote && checkoutState === 'remote-only') {
      const full = `${refInfo.remote}/${refInfo.name}`;
      return { ref: full, label: full, kind: 'remote-branch' };
    }
    if (isTag) {
      return { ref: refInfo.name, label: refInfo.name, kind: 'tag' };
    }
    return null;
  }, [isLocalBranch, isRemoteBranch, isTag, refInfo.remote, refInfo.name, checkoutState]);
  const showWorktreeGroup = worktreeSource !== null || branchWorktree !== undefined;
  // A single "Create worktree…" item, reused across the local / remote / tag arms.
  const createWorktreeItem = worktreeSource ? (
    <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateWorktreeOpen(true)}>
      Create worktree…
    </ContextMenu.Item>
  ) : null;

  // Same "Fast-forward Local Branch from Remote" item on the local-branch and
  // remote-branch arms; the arms differ only in their surrounding guard.
  const fastForwardItem = (
    <ContextMenu.Item
      className={menuItemClass}
      onSelect={() => setFastForwardOpen(true)}
      disabled={loading || rebaseInProgress}
    >
      Fast-forward Local Branch from Remote
    </ContextMenu.Item>
  );

  // pendingCheckout is for this branch (from checkoutNeedsStash response)
  const stashConfirmOpen = pendingCheckout !== null && pendingCheckout.name === refInfo.name;
  const forceDeleteConfirmOpen = pendingForceDeleteBranch !== null && pendingForceDeleteBranch.name === refInfo.name;

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content className={`min-w-[160px] ${menuContentClass}`}>
            {/* Compare-refs (042-compare-refs) — branches and tags only; stashes excluded (FR-017) */}
            {!isStash && compareSlotForThisRef && (
              <>
                <CompareMenuItems slot={compareSlotForThisRef} />
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {isBranch && !isCurrentBranch && (
              <ContextMenu.Item className={menuItemClass} onSelect={handleCheckout}>
                Checkout {refInfo.name}
              </ContextMenu.Item>
            )}

            {canRebaseOnto && (
              <ContextMenu.Item
                className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                disabled={isOperationInProgress}
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
                {!isCurrentBranch && !isMergedBadge && fastForwardItem}
                {isCurrentBranch && (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => rpcClient.pull()}
                    disabled={loading}
                  >
                    Pull Branch
                  </ContextMenu.Item>
                )}
                {showWorktreeGroup && (
                  <>
                    <ContextMenu.Separator className={menuSeparatorClass} />
                    {createWorktreeItem}
                    {branchWorktree && (
                      <WorktreeMenuItems worktree={branchWorktree} onRemove={openRemoveWorktreeDialog} />
                    )}
                  </>
                )}
                {!isCurrentBranch && (
                  <>
                    <ContextMenu.Separator className={menuSeparatorClass} />
                    <ContextMenu.Item className={dangerItemClass} onSelect={() => setDeleteConfirmOpen(true)}>
                      Delete Branch
                    </ContextMenu.Item>
                  </>
                )}
              </>
            )}

            {isRemoteBranch && refInfo.remote && (
              <>
                {!isMergedBadge && fastForwardItem}
                {showWorktreeGroup && (
                  <>
                    <ContextMenu.Separator className={menuSeparatorClass} />
                    {createWorktreeItem}
                  </>
                )}
                <ContextMenu.Separator className={menuSeparatorClass} />
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
                {showWorktreeGroup && (
                  <>
                    <ContextMenu.Separator className={menuSeparatorClass} />
                    {createWorktreeItem}
                  </>
                )}
                <ContextMenu.Separator className={menuSeparatorClass} />
                <ContextMenu.Item className={dangerItemClass} onSelect={() => setDeleteConfirmOpen(true)}>
                  Delete Tag
                </ContextMenu.Item>
              </>
            )}

            {!isStash && (
              <>
                <ContextMenu.Separator className={menuSeparatorClass} />
                <ContextMenu.Item className={menuItemClass} onSelect={handleCopyName}>
                  Copy {isTag ? 'Tag' : 'Branch'} Name
                </ContextMenu.Item>
              </>
            )}

            {isBranch && (
              <>
                <ContextMenu.Separator className={menuSeparatorClass} />
                <BranchFilterMenuItem refInfo={refInfo} />
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>

      {/* Delete confirmation for tags and remote branches */}
      <ConfirmDialog
        open={deleteConfirmOpen && !isLocalBranch}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          if (isTag) {
            rpcClient.deleteTag(refInfo.name);
          } else if (isRemoteBranch && refInfo.remote) {
            rpcClient.deleteRemoteBranch(refInfo.remote, refInfo.name);
          }
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        title={isTag ? 'Delete Tag' : 'Delete Remote Branch'}
        description={
          isTag
            ? `Are you sure you want to delete tag '${refInfo.name}'?`
            : `Are you sure you want to delete remote branch '${displayName}'? This will remove it from the remote.`
        }
        confirmLabel="Delete"
        variant="danger"
        commandPreview={deleteCommandPreview}
      />

      {/* Delete confirmation for local branches (with optional remote delete) */}
      <DeleteBranchDialog
        open={deleteConfirmOpen && isLocalBranch}
        branchName={refInfo.name}
        remoteBranch={remoteBranch}
        onConfirm={(deleteRemote) => {
          setDeleteConfirmOpen(false);
          rpcClient.deleteBranch(refInfo.name, undefined, deleteRemote);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* Force delete dialog (with optional remote delete, pre-populated from initial attempt).
         key forces remount when deleteRemote state changes so useState picks up the new initialDeleteRemote. */}
      <DeleteBranchDialog
        key={`force-delete-${!!pendingForceDeleteBranch?.deleteRemote}`}
        open={forceDeleteConfirmOpen}
        branchName={refInfo.name}
        force
        remoteBranch={remoteBranch}
        initialDeleteRemote={!!pendingForceDeleteBranch?.deleteRemote}
        onConfirm={(deleteRemote) => {
          useGraphStore.getState().setPendingForceDeleteBranch(null);
          rpcClient.deleteBranch(refInfo.name, true, deleteRemote);
        }}
        onCancel={() => useGraphStore.getState().setPendingForceDeleteBranch(null)}
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
        buildCommandPreview={buildRenamePreview}
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

      {/* Fast-forward local branch from remote (no checkout).
         Shared between two entry points: from a local/dual branch badge (local exists, fast-forward it),
         and from a remote-only branch badge (local does not yet exist, create it from remote tip). */}
      <ConfirmDialog
        open={fastForwardOpen}
        onConfirm={() => {
          setFastForwardOpen(false);
          rpcClient.fastForwardLocalBranch(fastForwardRemote, refInfo.name, fastForwardSetUpstream);
        }}
        onCancel={() => setFastForwardOpen(false)}
        title="Fast-forward Local Branch from Remote"
        description={
          checkoutState === 'remote-only'
            ? `Create local branch '${refInfo.name}' from '${fastForwardRemote}/${refInfo.name}' and set it as the upstream, without checkout. Your current branch and working tree are not affected.`
            : `Update local branch '${refInfo.name}' to match remote branch without checkout. Your current branch and working tree are not affected.`
        }
        confirmLabel="Fast-forward"
        variant="warning"
        commandPreview={fastForwardPreview}
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
        commandPreview={stashAndCheckoutPreview}
      />

      {/* Rebase confirmation */}
      <RebaseConfirmDialog
        open={rebaseConfirmOpen}
        onConfirm={handleRebaseConfirm}
        onCancel={() => setRebaseConfirmOpen(false)}
        title="Rebase Current Branch"
        description={`Rebase the current branch onto '${displayName}'? This will rewrite commit history. Pushed commits will require a force-push.`}
        targetRef={displayName}
      />

      {/* Create worktree dialog (local branch, remote-only badge, or tag) */}
      {createWorktreeOpen && worktreeSource && (
        <CreateWorktreeDialog
          open
          source={worktreeSource}
          existingWorktree={branchWorktree}
          onClose={() => setCreateWorktreeOpen(false)}
        />
      )}
      {removeWorktreeDialog}
    </>
  );
}

function BranchFilterMenuItem({ refInfo }: { refInfo: RefInfo }) {
  const filters = useGraphStore((s) => s.filters);
  const setFilters = useGraphStore((s) => s.setFilters);
  const branches = useGraphStore((s) => s.branches);

  // Build the list of branch names to toggle (local name + remote refs if combined)
  const branchNames = useMemo(() => {
    const names: string[] = [];
    if (refInfo.type === 'branch') {
      names.push(refInfo.name);
      // Also include remote counterparts
      for (const b of branches) {
        if (b.remote && b.name === refInfo.name) {
          names.push(`${b.remote}/${b.name}`);
        }
      }
    } else if (refInfo.type === 'remote' && refInfo.remote) {
      names.push(`${refInfo.remote}/${refInfo.name}`);
      // Also include local counterpart if it exists
      const hasLocal = branches.some((b) => !b.remote && b.name === refInfo.name);
      if (hasLocal) {
        names.push(refInfo.name);
      }
    }
    return names;
  }, [refInfo, branches]);

  const isFiltered = branchNames.some((name) => filters.branches?.includes(name));

  const handleToggle = () => {
    const current = filters.branches ?? [];
    let next: string[];
    if (isFiltered) {
      next = current.filter((b) => !branchNames.includes(b));
    } else {
      const toAdd = branchNames.filter((n) => !current.includes(n));
      next = [...current, ...toAdd];
    }
    const newBranches = next.length > 0 ? next : undefined;
    setFilters({ branches: newBranches });
    rpcClient.getCommits({ ...useGraphStore.getState().filters, branches: newBranches });
  };

  return (
    <ContextMenu.Item className={menuItemClass} onSelect={handleToggle}>
      {isFiltered ? 'Remove branch from filter' : 'Add branch to filter'}
    </ContextMenu.Item>
  );
}
