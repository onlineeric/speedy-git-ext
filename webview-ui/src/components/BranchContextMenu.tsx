import { useCallback, useMemo, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, RefInfo, SlotValue } from '@shared/types';
import { validateGitBranchName } from '@shared/gitRefValidation';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { useCurrentLocalBranch, useOperationInProgress } from '../stores/graphSelectors';
import type { UiAction, UiSurface } from '@shared/telemetry';
import { trackUiInteraction } from '../utils/telemetry';
import {
  buildDeleteRemoteBranchCommand,
  buildFastForwardLocalBranchCommand,
  buildPullCommand,
  buildRenameBranchCommand,
  buildStashAndCheckoutCommand,
} from '../utils/gitCommandBuilder';
import { resolveDefaultRemote, resolveDefaultRemoteName } from '../utils/resolveDefaultRemote';
import { CompareMenuItems } from './CompareMenuItems';
import { ConfirmDialog } from './ConfirmDialog';
import { DeleteBranchDialog } from './DeleteBranchDialog';
import { DeleteTagDialog } from './DeleteTagDialog';
import { PushTagDialog } from './PushTagDialog';
import { InputDialog } from './InputDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';
import { MergeDialog, type MergeSourceKind } from './MergeDialog';
import { PushDialog } from './PushDialog';
import { CheckoutWithPullDialog } from './CheckoutWithPullDialog';
import { CreateWorktreeDialog, type WorktreeSource } from './CreateWorktreeDialog';
import { useRemoveWorktreeDialog, WorktreeMenuItems } from './WorktreeMenuItems';
import { MenuItem } from './MenuItem';
import { LazyContextMenu } from './LazyContextMenu';
import { MenuCopySubmenu } from './MenuCopySubmenu';
import { MenuGroupSeparator } from './MenuGroupSeparator';
import { useCommitMenuItems } from './useCommitMenuItems';
import { MenuContent } from './MenuContent';


interface BranchContextMenuProps {
  refInfo: RefInfo;
  /**
   * The commit the badge sits on. A ref badge is always attached to a commit,
   * so its menu offers that commit's actions too — under its own "Commit"
   * group — rather than making the user re-aim at bare row space to reach them.
   */
  commit: Commit;
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

export function BranchContextMenu({ refInfo, commit, children }: BranchContextMenuProps) {
  return (
    <LazyContextMenu stopPropagation body={<BranchContextMenuBody refInfo={refInfo} commit={commit} />}>
      {children}
    </LazyContextMenu>
  );
}

function BranchContextMenuBody({ refInfo, commit }: { refInfo: RefInfo; commit: Commit }) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [checkoutWithPullOpen, setCheckoutWithPullOpen] = useState(false);
  const [rebaseConfirmOpen, setRebaseConfirmOpen] = useState(false);
  const [fastForwardOpen, setFastForwardOpen] = useState(false);
  const [createWorktreeOpen, setCreateWorktreeOpen] = useState(false);
  const [pushTagOpen, setPushTagOpen] = useState(false);
  const loading = useGraphStore((s) => s.loading);
  const branches = useGraphStore((s) => s.branches);
  const remotes = useGraphStore((s) => s.remotes);
  const branchWorktree = useGraphStore((s) => refInfo.type === 'branch' ? s.worktreeByBranch.get(refInfo.name) : undefined);
  const { openRemoveWorktreeDialog, removeWorktreeDialog } = useRemoveWorktreeDialog();

  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const pendingCheckout = useGraphStore((s) => s.pendingCheckout);
  const pendingForceDeleteBranch = useGraphStore((s) => s.pendingForceDeleteBranch);
  const isOperationInProgress = useOperationInProgress();

  const displayName = refInfo.remote
    ? `${refInfo.remote}/${refInfo.name}`
    : refInfo.name;

  const isRemoteBranch = refInfo.type === 'remote';
  const isLocalBranch = refInfo.type === 'branch';
  const isBranch = isLocalBranch || isRemoteBranch;
  const isTag = refInfo.type === 'tag';
  const isStash = refInfo.type === 'stash';

  // UI telemetry (049-usage-telemetry): one component serves three badge kinds.
  const menuSurface: UiSurface = isTag ? 'tagMenu' : isRemoteBranch ? 'remoteBranchMenu' : 'branchMenu';
  const track = (action: UiAction) => trackUiInteraction(menuSurface, action);

  // The commit this badge points at, supplying the Commit / Create / Copy groups.
  const commitMenu = useCommitMenuItems({ commit, surface: menuSurface, variant: 'badge' });

  // Tag push/delete-from-remote target: the configured default remote, or undefined
  // when no remote exists (which hides the remote-bearing affordances). FR-009.
  const hasRemote = remotes.length > 0;
  const tagRemote = hasRemote ? resolveDefaultRemoteName(remotes) : undefined;

  // Compare-refs (042-compare-refs). Stashes are excluded by FR-017.
  const compareSlotForThisRef: SlotValue | null = isBranch
    ? (refInfo.remote ? { kind: 'branch', name: refInfo.name, remote: refInfo.remote } : { kind: 'branch', name: refInfo.name })
    : isTag
      ? { kind: 'tag', name: refInfo.name }
      : null;

  // Identify whether this ref is the currently checked-out local branch.
  // displayRefToRefInfo never emits type 'head', so we match by name against the store.
  const headBranch = useCurrentLocalBranch();
  const isCurrentBranch = !!(headBranch && headBranch.name === refInfo.name && !refInfo.remote);

  // Merge source. `git merge` takes any commit-ish, so a tag and a remote-tracking
  // branch are as mergeable as a local one — the only badge that isn't is a stash,
  // which is applied rather than merged (FR-017 keeps it out of ref actions), and
  // the branch already checked out, which would merge itself. A remote branch has
  // to be named `<remote>/<name>`; `refInfo.name` alone is the local branch, if one
  // exists at all.
  const mergeKind: MergeSourceKind | null = isCurrentBranch
    ? null
    : isLocalBranch
      ? 'branch'
      : isRemoteBranch
        ? 'remote-branch'
        : isTag
          ? 'tag'
          : null;
  const mergeRef = isRemoteBranch ? displayName : refInfo.name;

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
    track('checkout');
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
    track('copyName');
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
    if (isRemoteBranch && refInfo.remote) return buildDeleteRemoteBranchCommand({ remote: refInfo.remote, name: refInfo.name });
    return '';
  }, [isRemoteBranch, refInfo.name, refInfo.remote]);

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
  // `git fetch <remote> <branch>:<branch>` refuses to update the checked-out branch,
  // so when the fast-forward target is the current branch (reachable from its remote
  // badge), the dialog degrades to a plain pull instead.
  const fastForwardTargetIsCurrent = !!headBranch && headBranch.name === refInfo.name;
  const fastForwardPreview = useMemo(
    () =>
      fastForwardTargetIsCurrent
        ? buildPullCommand({ remote: fastForwardRemote, branch: refInfo.name })
        : buildFastForwardLocalBranchCommand({ remote: fastForwardRemote, branch: refInfo.name, setUpstream: fastForwardSetUpstream }),
    [fastForwardTargetIsCurrent, fastForwardRemote, refInfo.name, fastForwardSetUpstream],
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
    <MenuItem onSelect={() => { track('createWorktree'); setCreateWorktreeOpen(true); }}>
      Create worktree…
    </MenuItem>
  ) : null;

  // Same "Fast-forward Local Branch from Remote" item on the local-branch and
  // remote-branch arms; the arms differ only in their surrounding guard.
  const fastForwardItem = (
    <MenuItem
      disabled={loading || rebaseInProgress || !hasRemote}
      onSelect={() => {
        track('fastForward');
        setFastForwardOpen(true);
      }}
    >
      Fast-forward Local Branch from Remote
    </MenuItem>
  );

  // pendingCheckout is for this branch (from checkoutNeedsStash response)
  const stashConfirmOpen = pendingCheckout !== null && pendingCheckout.name === refInfo.name;
  const forceDeleteConfirmOpen = pendingForceDeleteBranch !== null && pendingForceDeleteBranch.name === refInfo.name;

  // Groups are organised by the object each item acts on, so a menu that mixes
  // ref and commit actions stays unambiguous. The tag arm has no remote-side
  // group of its own — "Push Tag" belongs with the tag itself. Stash badges get
  // nothing: a stash is not a ref you can act on from here (FR-017), which is
  // also why `compareSlotForThisRef` is already null for them.
  const showRemoteGroup = isLocalBranch || (isRemoteBranch && !!refInfo.remote && !isMergedBadge);

  return (
    <>
      <ContextMenu.Portal>
        <MenuContent>
            {/* The ref this badge names, ordered from navigating to it through to deleting it. */}
            {!isStash && (
              <>
                <MenuGroupSeparator label={isTag ? 'Tag' : 'Branch'} name={displayName} />

                {isBranch && !isCurrentBranch && (
                  <MenuItem onSelect={handleCheckout}>Checkout {refInfo.name}</MenuItem>
                )}

                {mergeKind && (
                  <MenuItem
                    disabled={isOperationInProgress}
                    onSelect={() => { track('merge'); setMergeDialogOpen(true); }}
                  >
                    Merge into Current Branch
                  </MenuItem>
                )}

                {canRebaseOnto && (
                  <MenuItem
                    disabled={isOperationInProgress}
                    onSelect={() => {
                      track('rebase');
                      setRebaseConfirmOpen(true);
                    }}
                  >
                    Rebase Current Branch onto This
                  </MenuItem>
                )}

                {isLocalBranch && (
                  <MenuItem onSelect={() => { track('renameBranch'); setRenameOpen(true); }}>
                    Rename Branch...
                  </MenuItem>
                )}

                {isTag && (
                  <MenuItem
                    disabled={!hasRemote}
                    onSelect={() => {
                      track('pushTag');
                      setPushTagOpen(true);
                    }}
                  >
                    Push Tag
                  </MenuItem>
                )}

                {/* Filtering the graph by this branch is a view action, but it reads as
                   "something I do to this branch", so it sits with the branch. It stays
                   above the deletions, which are always last in their group. */}
                {isBranch && <BranchFilterMenuItem refInfo={refInfo} surface={menuSurface} />}

                {isLocalBranch && !isCurrentBranch && (
                  <MenuItem danger onSelect={() => { track('deleteBranch'); setDeleteConfirmOpen(true); }}>
                    Delete Branch
                  </MenuItem>
                )}

                {isRemoteBranch && refInfo.remote && (
                  <MenuItem danger onSelect={() => { track('deleteRemoteBranch'); setDeleteConfirmOpen(true); }}>
                    Delete Remote Branch
                  </MenuItem>
                )}

                {isTag && (
                  <MenuItem danger onSelect={() => { track('deleteTag'); setDeleteConfirmOpen(true); }}>
                    Delete Tag
                  </MenuItem>
                )}
              </>
            )}

            {/* The commit under the badge — the same actions the row's own menu offers. */}
            {!isStash && (
              <>
                <MenuGroupSeparator label="Commit" name={commit.abbreviatedHash} />
                {commitMenu.commitItems}

                <MenuGroupSeparator label="Create" />
                {commitMenu.createItems}
              </>
            )}

            {showRemoteGroup && (
              <>
                <MenuGroupSeparator label="Remote" />
                {isLocalBranch && (
                  <MenuItem
                    disabled={!hasRemote}
                    onSelect={() => {
                      track('push');
                      setPushDialogOpen(true);
                    }}
                  >
                    Push Branch
                  </MenuItem>
                )}
                {isLocalBranch && isCurrentBranch && (
                  <MenuItem
                    disabled={loading || !hasRemote}
                    onSelect={() => {
                      track('pull');
                      rpcClient.pull();
                    }}
                  >
                    Pull Branch
                  </MenuItem>
                )}
                {!isMergedBadge && (isRemoteBranch || !isCurrentBranch) && fastForwardItem}
              </>
            )}

            {showWorktreeGroup && (
              <>
                <MenuGroupSeparator label="Worktree" />
                {createWorktreeItem}
                {/* `branchWorktree` is only ever resolved for local-branch badges. */}
                {branchWorktree && (
                  <WorktreeMenuItems worktree={branchWorktree} onRemove={openRemoveWorktreeDialog} />
                )}
              </>
            )}

            {/* Compare-refs (042-compare-refs) — branches and tags only; stashes excluded (FR-017) */}
            {compareSlotForThisRef && (
              <>
                <MenuGroupSeparator label="Compare" />
                <CompareMenuItems slot={compareSlotForThisRef} surface={menuSurface} />
              </>
            )}

            {!isStash && (
              <>
                <MenuGroupSeparator />
                <MenuCopySubmenu>
                  {commitMenu.copyItems}
                  <MenuItem onSelect={handleCopyName}>
                    Copy {isTag ? 'Tag' : 'Branch'} Name
                  </MenuItem>
                </MenuCopySubmenu>
              </>
            )}
          </MenuContent>
        </ContextMenu.Portal>

      {/* Delete confirmation for remote branches */}
      <ConfirmDialog
        open={deleteConfirmOpen && isRemoteBranch}
        onConfirm={() => {
          setDeleteConfirmOpen(false);
          if (isRemoteBranch && refInfo.remote) {
            rpcClient.deleteRemoteBranch(refInfo.remote, refInfo.name);
          }
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        title="Delete Remote Branch"
        description={`Are you sure you want to delete remote branch '${displayName}'? This will remove it from the remote.`}
        telemetryId="deleteRemoteBranch"
        confirmLabel="Delete"
        variant="danger"
        commandPreview={deleteCommandPreview}
      />

      {/* Delete confirmation for tags (with optional remote delete) */}
      {isTag && (
        <DeleteTagDialog
          open={deleteConfirmOpen}
          tagName={refInfo.name}
          remote={tagRemote}
          onConfirm={(deleteRemote) => {
            setDeleteConfirmOpen(false);
            rpcClient.deleteTag(refInfo.name, deleteRemote);
          }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      {/* Push tag dialog (standalone push with optional force) */}
      {isTag && tagRemote && (
        <PushTagDialog
          open={pushTagOpen}
          tagName={refInfo.name}
          remote={tagRemote}
          onConfirm={(force) => {
            setPushTagOpen(false);
            rpcClient.pushTag(refInfo.name, tagRemote, force);
          }}
          onCancel={() => setPushTagOpen(false)}
        />
      )}

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
        telemetryId="renameBranch"
        defaultValue={refInfo.name}
        validate={(v) =>
          v === refInfo.name
            ? 'New name is the same as the current name'
            : validateGitBranchName(v).message
        }
        buildCommandPreview={buildRenamePreview}
      />

      {/* Push dialog */}
      <PushDialog
        open={pushDialogOpen}
        branchName={refInfo.name}
        onCancel={() => setPushDialogOpen(false)}
      />

      {/* Merge dialog */}
      {mergeKind && (
        <MergeDialog
          open={mergeDialogOpen}
          kind={mergeKind}
          sourceRef={mergeRef}
          onConfirm={(options) => {
            setMergeDialogOpen(false);
            rpcClient.mergeBranch(mergeRef, options);
          }}
          onCancel={() => setMergeDialogOpen(false)}
        />
      )}

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
         Shared between three entry points: from a local/dual branch badge (local exists, fast-forward it),
         from a remote-only branch badge (local does not yet exist, create it from remote tip), and from
         the remote badge of the checked-out branch (fetch into the current branch is refused, so pull). */}
      <ConfirmDialog
        open={fastForwardOpen}
        onConfirm={() => {
          setFastForwardOpen(false);
          if (fastForwardTargetIsCurrent) {
            rpcClient.pull(fastForwardRemote, refInfo.name);
          } else {
            rpcClient.fastForwardLocalBranch(fastForwardRemote, refInfo.name, fastForwardSetUpstream);
          }
        }}
        onCancel={() => setFastForwardOpen(false)}
        title="Fast-forward Local Branch from Remote"
        telemetryId="fastForward"
        description={
          checkoutState === 'remote-only'
            ? `Create local branch '${refInfo.name}' from '${fastForwardRemote}/${refInfo.name}' and set it as the upstream, without checkout. Your current branch and working tree are not affected.`
            : fastForwardTargetIsCurrent
              ? `Update local branch '${refInfo.name}' to match the remote branch. Since '${refInfo.name}' is the currently checked-out branch, will do a Pull.`
              : `Update local branch '${refInfo.name}' to match remote branch without checkout. Your current branch and working tree are not affected.`
        }
        confirmLabel={fastForwardTargetIsCurrent ? 'Pull' : 'Fast-forward'}
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
        telemetryId="stashAndCheckout"
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
      {commitMenu.dialogs}
    </>
  );
}

function BranchFilterMenuItem({ refInfo, surface }: { refInfo: RefInfo; surface: UiSurface }) {
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
    trackUiInteraction(surface, 'toggleBranchFilter');
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
    <MenuItem onSelect={handleToggle}>
      {isFiltered ? 'Remove branch from filter' : 'Add branch to filter'}
    </MenuItem>
  );
}
