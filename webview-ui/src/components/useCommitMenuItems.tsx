import { useEffect, useMemo, useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type {
  CherryPickOptions,
  Commit,
  CommitParentInfo,
  RebaseEntry,
  ResetMode,
  RevertOptions,
  SlotValue,
} from '@shared/types';
import type { UiAction, UiSurface } from '@shared/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { trackUiInteraction } from '../utils/telemetry';
import { buildCheckoutCommand, buildResetCommand } from '../utils/gitCommandBuilder';
import { setSlotsAndCompare } from '../utils/compareDispatch';
import { getReachabilityChecker } from '../utils/commitReachability';
import { getCommitMenuAvailability, isStashPseudoCommit } from '../utils/commitMenuAvailability';
import { CompareMenuItems } from './CompareMenuItems';
import { ConfirmDialog } from './ConfirmDialog';
import { CreateBranchDialog } from './CreateBranchDialog';
import { TagCreationDialog } from './TagCreationDialog';
import { CherryPickDialog } from './CherryPickDialog';
import { InteractiveRebaseDialog } from './InteractiveRebaseDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';
import { RevertDialog } from './RevertDialog';
import { DropCommitDialog } from './DropCommitDialog';
import { CreateWorktreeDialog } from './CreateWorktreeDialog';
import { MenuSubTrigger } from './MenuSubTrigger';
import { dangerItemClass, MENU_COLLISION_PADDING, menuContentClass, menuItemClass, menuItemDisabledClass } from './menuStyles';

/**
 * Where the commit items are being rendered.
 *
 * - `row`   — the commit row's own menu: everything applies.
 * - `badge` — a branch/tag badge menu, which shows the same commit actions
 *   under its own "Commit" group. The badge menu already offers ref-flavoured
 *   compare, rebase-onto and create-worktree items, so the commit-flavoured
 *   twins are dropped rather than shown twice under near-identical labels.
 *   Multi-select actions go too: right-clicking a badge is not a selection
 *   gesture.
 */
export type CommitMenuVariant = 'row' | 'badge';

interface UseCommitMenuItemsOptions {
  commit: Commit;
  /** Hosting menu surface for UI telemetry (049-usage-telemetry). */
  surface: UiSurface;
  variant: CommitMenuVariant;
}

function buildResetDescription(
  mode: ResetMode | null,
  hasRemote: boolean,
  branchName: string | undefined
): string {
  const remotePart =
    hasRemote && branchName
      ? ` Because this branch has a remote counterpart (origin/${branchName}), you will need to force-push to update the remote, which may affect collaborators.`
      : '';
  if (mode === 'hard') {
    return `This will permanently discard all staged and unstaged changes from the removed commits.${remotePart} This action cannot be undone.`;
  }
  return `This branch has a remote counterpart. After resetting, you will need to force-push to update the remote, which may affect collaborators. Proceed?`;
}

/**
 * Interactive-rebase cluster: kick off a `getRebaseCommits` request, wait for the
 * entries to arrive in the store, then open the dialog. Returns the trigger and
 * the (lazily rendered) dialog so the menu body stays focused on its items.
 */
function useInteractiveRebase(baseHash: string) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RebaseEntry[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  const pendingRebaseEntries = useGraphStore((s) => s.pendingRebaseEntries);

  useEffect(() => {
    if (awaiting && pendingRebaseEntries !== undefined) {
      const timeout = window.setTimeout(() => {
        setEntries(pendingRebaseEntries);
        useGraphStore.getState().setPendingRebaseEntries(undefined);
        setAwaiting(false);
        setOpen(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [awaiting, pendingRebaseEntries]);

  useEffect(() => {
    return () => {
      useGraphStore.getState().setPendingRebaseEntries(undefined);
    };
  }, []);

  const start = () => {
    setAwaiting(true);
    rpcClient.getRebaseCommits(baseHash);
  };

  const dialog = open ? (
    <InteractiveRebaseDialog
      open
      baseHash={baseHash}
      initialEntries={entries}
      onClose={() => {
        setOpen(false);
        setEntries([]);
      }}
    />
  ) : null;

  return { start, dialog };
}

/**
 * Revert cluster. Merge commits need their parents fetched first so the dialog
 * can render the mainline picker; non-merge commits open immediately.
 */
function useRevertCommit(commit: Commit) {
  const [open, setOpen] = useState(false);
  const [parents, setParents] = useState<CommitParentInfo[]>([]);
  const isMergeCommit = commit.parents.length > 1;

  const start = async () => {
    if (isMergeCommit) {
      try {
        setParents(await rpcClient.getCommitParents(commit.parents));
      } catch {
        // Store error state is already set by the RPC client.
        return;
      }
    } else {
      setParents([]);
    }
    setOpen(true);
  };

  const confirm = (options: RevertOptions) => {
    if (options.mode !== 'edit-message') setOpen(false);
    rpcClient.revert(commit.hash, options);
  };

  const dialog = (
    <RevertDialog
      open={open}
      commit={commit}
      parents={parents}
      onConfirm={confirm}
      onCancel={() => setOpen(false)}
    />
  );

  return { start, dialog };
}

/** Drop cluster: resolve whether the commit is pushed, then open the dialog. */
function useDropCommit(commit: Commit) {
  const [open, setOpen] = useState(false);
  const [pushed, setPushed] = useState(false);

  const start = async () => {
    try {
      setPushed(await rpcClient.isCommitPushed(commit.hash));
      setOpen(true);
    } catch {
      // Store error state is already set by the RPC client.
    }
  };

  const dialog = (
    <DropCommitDialog
      open={open}
      onOpenChange={setOpen}
      commitHash={commit.hash}
      commitSubject={commit.subject}
      isPushed={pushed}
      onConfirm={() => {
        setOpen(false);
        rpcClient.dropCommit(commit.hash);
      }}
    />
  );

  return { start, dialog };
}

/**
 * Every action that applies to a commit, grouped the way menus present them,
 * plus the dialogs they drive.
 *
 * Both the commit row menu and the ref badge menus are built from this one
 * hook: a branch badge sits *on* a commit, so right-clicking it must not lose
 * access to that commit's actions. The groups come back separately rather than
 * as one blob because callers interleave them with their own — a badge menu
 * puts its ref group above the commit group and folds its "Copy <ref> Name"
 * item in with the commit's copy items. Dialogs are returned apart from the
 * items because they must render outside the menu portal.
 */
export function useCommitMenuItems({ commit, surface, variant }: UseCommitMenuItemsOptions) {
  const [checkoutCommitConfirmOpen, setCheckoutCommitConfirmOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
  const [createWorktreeOpen, setCreateWorktreeOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [cherryPickOpen, setCherryPickOpen] = useState(false);
  const [pendingResetMode, setPendingResetMode] = useState<ResetMode | null>(null);
  const [cherryPickCommits, setCherryPickCommits] = useState<Commit[]>([]);
  const [rebaseOntoConfirmOpen, setRebaseOntoConfirmOpen] = useState(false);

  const branches = useGraphStore((s) => s.branches);
  const selectedCommits = useGraphStore((s) => s.selectedCommits);
  const commits = useGraphStore((s) => s.commits);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const clearSelectedCommits = useGraphStore((s) => s.clearSelectedCommits);
  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const revertInProgress = useGraphStore((s) => s.revertInProgress);
  const cherryPickInProgress = useGraphStore((s) => s.cherryPickInProgress);
  const loading = useGraphStore((s) => s.loading);

  // Self-contained dialog clusters (state + async handler + dialog) live in hooks.
  const interactiveRebase = useInteractiveRebase(commit.hash);
  const revert = useRevertCommit(commit);
  const drop = useDropCommit(commit);

  const track = (action: UiAction) => trackUiInteraction(surface, action);

  const isRowMenu = variant === 'row';
  const currentLocalBranch = branches.find((b) => b.current && !b.remote) ?? null;
  const hasRemoteUpstream =
    currentLocalBranch !== null &&
    branches.some((b) => b.name === currentLocalBranch.name && !!b.remote);

  // Built from the *unfiltered* commit list: which operations apply is a question
  // about git history, not about what the author/text filters happen to be showing.
  // Walking `mergedCommits` instead let a filter punch holes in the parent chain and
  // silently hide Drop Commit. The checker is cached by commit-list identity, so the
  // commit-by-hash map is built once per commits change no matter how many menus
  // (row menu plus one per opened ref badge) are asking.
  const reachability = useMemo(() => getReachabilityChecker(commits), [commits]);
  const isOnFirstParentChain = currentLocalBranch
    ? reachability.isOnFirstParentChain(commit.hash, currentLocalBranch.hash)
    : false;

  const availability = getCommitMenuAvailability({
    commit,
    currentBranchHash: currentLocalBranch?.hash ?? null,
    isOnFirstParentChain,
  });

  // Transient busy states only *disable* items — they stay visible so the user
  // can still see the option exists. Hiding them on `loading` used to make items
  // disappear during the brief refresh any filter change triggers, which read as
  // an intermittent bug.
  const isOperationInProgress = loading || rebaseInProgress || cherryPickInProgress || revertInProgress;

  const isMultiSelectActive =
    isRowMenu && selectedCommits.length > 1 && selectedCommits.includes(commit.hash);

  const hasSelectedMergeCommit = isMultiSelectActive &&
    mergedCommits.some((item) => selectedCommits.includes(item.hash) && item.parents.length > 1);

  const handleRebaseOntoCommitConfirm = (ignoreDate: boolean) => {
    setRebaseOntoConfirmOpen(false);
    useGraphStore.getState().setLoading(true);
    rpcClient.rebase(commit.hash, ignoreDate);
  };

  // FR-015 (Session 2026-05-09): "Compare these commits" sets Base = oldest selected,
  // Target = newest selected — direct mental model "compare the commits I selected."
  const handleCompareRange = () => {
    if (selectedCommits.length < 2) return;
    // Read commits lazily here (not via a render subscription) so an open menu
    // doesn't re-render on every refresh/loadMore — the list is only needed at click time.
    const commits = useGraphStore.getState().commits;
    // Order by index in commits[] (committer-date-descending). Newest = lowest index, oldest = highest index.
    const selectedSet = new Set(selectedCommits);
    let oldest: Commit | null = null;
    let newest: Commit | null = null;
    for (const c of commits) {
      if (!selectedSet.has(c.hash)) continue;
      if (newest === null) newest = c;
      oldest = c;
    }
    if (!oldest || !newest) return;
    const a: SlotValue = { kind: 'commit', hash: oldest.hash };
    const b: SlotValue = { kind: 'commit', hash: newest.hash };
    clearSelectedCommits();
    setSlotsAndCompare(a, b);
  };

  const handleResetSelect = (mode: ResetMode) => {
    if (mode === 'hard' || hasRemoteUpstream) {
      setPendingResetMode(mode);
      setResetConfirmOpen(true);
    } else {
      rpcClient.resetBranch(commit.hash, mode);
    }
  };

  const openCherryPickDialog = (commits: Commit[], clearSelection = false) => {
    track('cherryPick');
    if (clearSelection) clearSelectedCommits();
    setCherryPickCommits(commits);
    setCherryPickOpen(true);
  };

  const handleCherryPickConfirm = (options: CherryPickOptions) => {
    setCherryPickOpen(false);
    const hashSet = new Set(cherryPickCommits.map((item) => item.hash));
    const orderedHashes = mergedCommits
      .filter((item) => hashSet.has(item.hash) && !isStashPseudoCommit(item))
      .map((item) => item.hash)
      .reverse();
    rpcClient.cherryPick(orderedHashes, options);
    clearSelectedCommits();
  };

  /** The commit itself — ordered from navigating to it through to rewriting it away. */
  const commitItems = (
    <>
      <ContextMenu.Item
        className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
        disabled={isOperationInProgress}
        onSelect={() => {
          track('checkoutCommit');
          setCheckoutCommitConfirmOpen(true);
        }}
      >
        Checkout this commit
      </ContextMenu.Item>

      {/* Merge commits cherry-pick individually; a multi-select cherry-picks the
         whole selection (disabled if it contains a merge commit); otherwise the
         single commit, clearing any stale selection that doesn't include it. */}
      {availability.canCherryPick && (
        availability.isMergeCommit ? (
          <ContextMenu.Item className={menuItemClass} onSelect={() => openCherryPickDialog([commit])}>
            Cherry-Pick Commit
          </ContextMenu.Item>
        ) : isMultiSelectActive ? (
          <ContextMenu.Item
            className={hasSelectedMergeCommit ? menuItemDisabledClass : menuItemClass}
            disabled={hasSelectedMergeCommit}
            title={hasSelectedMergeCommit ? 'Selection contains merge commits. Cherry-pick merge commits individually.' : undefined}
            onSelect={() => {
              openCherryPickDialog(mergedCommits.filter((item) => selectedCommits.includes(item.hash)));
            }}
          >
            Cherry-Pick Selected Commits ({selectedCommits.length})
          </ContextMenu.Item>
        ) : (
          <ContextMenu.Item
            className={menuItemClass}
            onSelect={() => openCherryPickDialog([commit], selectedCommits.length > 1)}
          >
            Cherry-Pick Commit
          </ContextMenu.Item>
        )
      )}

      {availability.canRebase && (
        <>
          {/* The badge menu's parent already offers the ref-flavoured rebase. */}
          {isRowMenu && (
            <ContextMenu.Item
              className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
              disabled={isOperationInProgress}
              onSelect={() => {
                track('rebase');
                setRebaseOntoConfirmOpen(true);
              }}
            >
              Rebase Current Branch onto This Commit
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
            disabled={isOperationInProgress}
            onSelect={() => {
              track('interactiveRebase');
              interactiveRebase.start();
            }}
          >
            Start Interactive Rebase from Here
          </ContextMenu.Item>
        </>
      )}

      {revertInProgress && (
        <>
          <ContextMenu.Item className={menuItemClass} onSelect={() => { track('continueRevert'); rpcClient.continueRevert(); }}>
            Continue Revert
          </ContextMenu.Item>
          <ContextMenu.Item className={menuItemClass} onSelect={() => { track('abortRevert'); rpcClient.abortRevert(); }}>
            Abort Revert
          </ContextMenu.Item>
        </>
      )}

      {availability.canRevert && (
        <ContextMenu.Item
          className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
          disabled={isOperationInProgress}
          onSelect={() => {
            track('revert');
            void revert.start();
          }}
        >
          Revert Commit
        </ContextMenu.Item>
      )}

      {availability.canDrop && (
        // Dropping destroys a commit, so it carries the same danger styling as
        // Delete Branch / Delete Tag rather than reading as an ordinary action.
        <ContextMenu.Item
          className={isOperationInProgress ? menuItemDisabledClass : dangerItemClass}
          disabled={isOperationInProgress}
          onSelect={() => {
            track('dropCommit');
            void drop.start();
          }}
        >
          Drop Commit
        </ContextMenu.Item>
      )}

      {availability.canReset && (
        <ContextMenu.Sub>
          <MenuSubTrigger danger>Reset Current Branch to Here</MenuSubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent className={`min-w-[160px] ${menuContentClass}`} collisionPadding={MENU_COLLISION_PADDING}>
              <ContextMenu.Item className={menuItemClass} onSelect={() => { track('resetSoft'); handleResetSelect('soft'); }}>
                Soft (keep staged)
              </ContextMenu.Item>
              <ContextMenu.Item className={menuItemClass} onSelect={() => { track('resetMixed'); handleResetSelect('mixed'); }}>
                Mixed (keep unstaged)
              </ContextMenu.Item>
              {/* Soft and mixed keep your work in the tree; only hard throws it away,
                  so it is the only entry that carries the destructive colour. */}
              <ContextMenu.Item className={dangerItemClass} onSelect={() => { track('resetHard'); handleResetSelect('hard'); }}>
                Hard (discard all)
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>
      )}

    </>
  );

  /**
   * Compare (042-compare-refs). Badge menus compare by ref instead, in their own
   * Compare group, so this is the row menu's alone.
   */
  const compareItems = isRowMenu ? (
    isMultiSelectActive ? (
      <ContextMenu.Item
        className={menuItemClass}
        onSelect={() => {
          track('compareCommits');
          handleCompareRange();
        }}
      >
        Compare these commits
      </ContextMenu.Item>
    ) : (
      <CompareMenuItems slot={{ kind: 'commit', hash: commit.hash }} surface={surface} resolvedHash={commit.hash} />
    )
  ) : null;

  /** Refs created *at* this commit. Worktrees are a group of their own. */
  const createItems = (
    <>
      <ContextMenu.Item className={menuItemClass} onSelect={() => { track('createBranch'); setCreateBranchOpen(true); }}>
        Create Branch Here...
      </ContextMenu.Item>
      <ContextMenu.Item className={menuItemClass} onSelect={() => { track('createTag'); setCreateTagOpen(true); }}>
        Create Tag Here...
      </ContextMenu.Item>
    </>
  );

  /** A badge menu creates worktrees from its ref, which is the better default. */
  const worktreeItem = isRowMenu ? (
    <ContextMenu.Item className={menuItemClass} onSelect={() => { track('createWorktree'); setCreateWorktreeOpen(true); }}>
      Create worktree…
    </ContextMenu.Item>
  ) : null;

  /** Rendered inside the shared Copy submenu, alongside any ref-name item. */
  const copyItems = (
    <>
      <ContextMenu.Item className={menuItemClass} onSelect={() => { track('copyHash'); rpcClient.copyToClipboard(commit.hash); }}>
        Copy Commit Hash
      </ContextMenu.Item>
      <ContextMenu.Item className={menuItemClass} onSelect={() => { track('copyShortHash'); rpcClient.copyToClipboard(commit.abbreviatedHash); }}>
        Copy Short Hash
      </ContextMenu.Item>
      <ContextMenu.Item className={menuItemClass} onSelect={() => { track('copyMessage'); rpcClient.copyToClipboard(commit.subject); }}>
        Copy Commit Message
      </ContextMenu.Item>
    </>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={checkoutCommitConfirmOpen}
        onConfirm={() => {
          setCheckoutCommitConfirmOpen(false);
          rpcClient.checkoutCommit(commit.hash);
        }}
        onCancel={() => setCheckoutCommitConfirmOpen(false)}
        title="Checkout Commit"
        description={`Checkout commit ${commit.abbreviatedHash} will result in detached HEAD. Continue?`}
        telemetryId="checkoutCommit"
        commandPreview={buildCheckoutCommand({ branch: commit.abbreviatedHash, pull: false })}
      />

      <CreateBranchDialog
        open={createBranchOpen}
        commit={commit}
        onClose={() => setCreateBranchOpen(false)}
      />

      <TagCreationDialog
        open={createTagOpen}
        commit={commit}
        onClose={() => setCreateTagOpen(false)}
      />

      {createWorktreeOpen && (
        <CreateWorktreeDialog
          open
          source={{ ref: commit.hash, label: commit.abbreviatedHash, kind: 'commit' }}
          onClose={() => setCreateWorktreeOpen(false)}
        />
      )}

      <ConfirmDialog
        open={resetConfirmOpen}
        onConfirm={() => {
          setResetConfirmOpen(false);
          if (pendingResetMode) rpcClient.resetBranch(commit.hash, pendingResetMode);
          setPendingResetMode(null);
        }}
        onCancel={() => {
          setResetConfirmOpen(false);
          setPendingResetMode(null);
        }}
        title={pendingResetMode === 'hard' ? 'Reset Branch (Hard)' : 'Reset Branch'}
        telemetryId="reset"
        description={buildResetDescription(pendingResetMode, hasRemoteUpstream, currentLocalBranch?.name)}
        confirmLabel={pendingResetMode === 'hard' ? 'Discard Changes' : 'Reset'}
        variant={pendingResetMode === 'hard' ? 'danger' : 'warning'}
        commandPreview={pendingResetMode ? buildResetCommand({ hash: commit.abbreviatedHash, mode: pendingResetMode }) : undefined}
      />

      <CherryPickDialog
        open={cherryPickOpen}
        commits={cherryPickCommits}
        onConfirm={handleCherryPickConfirm}
        onCancel={() => setCherryPickOpen(false)}
      />

      {isRowMenu && (
        <RebaseConfirmDialog
          open={rebaseOntoConfirmOpen}
          onConfirm={handleRebaseOntoCommitConfirm}
          onCancel={() => setRebaseOntoConfirmOpen(false)}
          title="Rebase Current Branch onto Commit"
          description={`Rebase the current branch onto commit ${commit.abbreviatedHash}? This will rewrite commit history. Pushed commits will require a force-push.`}
          targetRef={commit.hash}
        />
      )}

      {interactiveRebase.dialog}
      {revert.dialog}
      {drop.dialog}
    </>
  );

  return { commitItems, compareItems, createItems, worktreeItem, copyItems, dialogs };
}
