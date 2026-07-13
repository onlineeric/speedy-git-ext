import { useState, useEffect, useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, CherryPickOptions, ResetMode, RebaseEntry, CommitParentInfo, RevertOptions, SlotValue } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import type { UiAction } from '@shared/telemetry';
import { trackUiInteraction } from '../utils/telemetry';
import { buildResetCommand, buildCheckoutCommand } from '../utils/gitCommandBuilder';
import { setSlotsAndCompare } from '../utils/compareDispatch';
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
import { createReachabilityChecker } from '../utils/commitReachability';
import { menuContentClass, menuItemClass, menuItemDisabledClass, menuSeparatorClass } from './menuStyles';
import { LazyContextMenu } from './LazyContextMenu';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

function isStashPseudoCommit(commit: Commit): boolean {
  return commit.refs.some((ref) => ref.type === 'stash');
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

export function CommitContextMenu({ commit, children }: CommitContextMenuProps) {
  return (
    <LazyContextMenu body={<CommitContextMenuBody commit={commit} />}>
      {children}
    </LazyContextMenu>
  );
}

/** Track a commit-menu item click (049-usage-telemetry). */
function trackCommitMenu(action: UiAction) {
  trackUiInteraction('commitMenu', action);
}

function CommitContextMenuBody({ commit }: { commit: Commit }) {
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

  const currentLocalBranch = branches.find((b) => b.current && !b.remote) ?? null;
  const hasRemoteUpstream =
    currentLocalBranch !== null &&
    branches.some((b) => b.name === currentLocalBranch.name && !!b.remote);
  const showReset =
    currentLocalBranch !== null && commit.hash !== currentLocalBranch.hash;

  const isHeadCommit = commit.hash === currentLocalBranch?.hash;
  const isMergeCommit = commit.parents.length > 1;
  const isRootCommit = commit.parents.length === 0;
  const isOperationInProgress = loading || rebaseInProgress || cherryPickInProgress || revertInProgress;
  // Memoize the reachability checker so the commit-by-hash map is built once per
  // mergedCommits change instead of on every render of this per-row context menu.
  const reachability = useMemo(() => createReachabilityChecker(mergedCommits), [mergedCommits]);
  const isCommitOnCurrentBranch = currentLocalBranch
    ? reachability.isReachableFromHead(commit.hash, currentLocalBranch.hash)
    : false;

  // Rebase is applicable when there's a current branch and we're not already at this commit.
  // Transient busy states (loading/rebase/cherry-pick/revert in progress) only *disable* the
  // item — we keep it visible so the user can see the option exists.
  const canRebase = !isHeadCommit && !!currentLocalBranch;
  const canRevert = !isRootCommit && !isStashPseudoCommit(commit);
  const canDrop = !isRootCommit && !isMergeCommit && !isStashPseudoCommit(commit) && isCommitOnCurrentBranch;

  const handleRebaseOntoCommitConfirm = (ignoreDate: boolean) => {
    setRebaseOntoConfirmOpen(false);
    useGraphStore.getState().setLoading(true);
    rpcClient.rebase(commit.hash, ignoreDate);
  };

  const isMultiSelectActive =
    selectedCommits.length > 1 && selectedCommits.includes(commit.hash);

  const hasSelectedMergeCommit = isMultiSelectActive &&
    mergedCommits.some((item) => selectedCommits.includes(item.hash) && item.parents.length > 1);

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

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content className={`min-w-[180px] ${menuContentClass}`}>
            {/* Compare refs (042-compare-refs) */}
            {isMultiSelectActive ? (
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={() => {
                  trackCommitMenu('compareCommits');
                  handleCompareRange();
                }}
              >
                Compare these commits
              </ContextMenu.Item>
            ) : (
              <CompareMenuItems slot={{ kind: 'commit', hash: commit.hash }} surface="commitMenu" resolvedHash={commit.hash} />
            )}
            <ContextMenu.Separator className={menuSeparatorClass} />

            <ContextMenu.Item
              className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
              disabled={isOperationInProgress}
              onSelect={() => {
                trackCommitMenu('checkoutCommit');
                setCheckoutCommitConfirmOpen(true);
              }}
            >
              Checkout this commit
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />

            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('createBranch'); setCreateBranchOpen(true); }}>
              Create Branch Here...
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('createTag'); setCreateTagOpen(true); }}>
              Create Tag Here...
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('createWorktree'); setCreateWorktreeOpen(true); }}>
              Create worktree…
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />

            {!isHeadCommit && (
              <>
                {/* Merge commits cherry-pick individually; a multi-select cherry-picks the
                   whole selection (disabled if it contains a merge commit); otherwise the
                   single commit, clearing any stale selection that doesn't include it. */}
                {isMergeCommit ? (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => {
                      trackCommitMenu('cherryPick');
                      openCherryPickDialog([commit]);
                    }}
                  >
                    Cherry-Pick Commit
                  </ContextMenu.Item>
                ) : isMultiSelectActive ? (
                  <ContextMenu.Item
                    className={hasSelectedMergeCommit ? menuItemDisabledClass : menuItemClass}
                    disabled={hasSelectedMergeCommit}
                    title={hasSelectedMergeCommit ? 'Selection contains merge commits. Cherry-pick merge commits individually.' : undefined}
                    onSelect={() => {
                      trackCommitMenu('cherryPick');
                      openCherryPickDialog(mergedCommits.filter((item) => selectedCommits.includes(item.hash)));
                    }}
                  >
                    Cherry-Pick Selected Commits ({selectedCommits.length})
                  </ContextMenu.Item>
                ) : (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => {
                      trackCommitMenu('cherryPick');
                      openCherryPickDialog([commit], selectedCommits.length > 1);
                    }}
                  >
                    Cherry-Pick Commit
                  </ContextMenu.Item>
                )}
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {canRebase && (
              <>
                <ContextMenu.Item
                  className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                  disabled={isOperationInProgress}
                  onSelect={() => {
                    trackCommitMenu('rebase');
                    setRebaseOntoConfirmOpen(true);
                  }}
                >
                  Rebase Current Branch onto This Commit
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                  disabled={isOperationInProgress}
                  onSelect={() => {
                    trackCommitMenu('interactiveRebase');
                    interactiveRebase.start();
                  }}
                >
                  Start Interactive Rebase from Here
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {canRevert && (
              <>
                <ContextMenu.Item
                  className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                  disabled={isOperationInProgress}
                  onSelect={() => {
                    trackCommitMenu('revert');
                    void revert.start();
                  }}
                >
                  Revert Commit
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {revertInProgress && (
              <>
                <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('continueRevert'); rpcClient.continueRevert(); }}>
                  Continue Revert
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('abortRevert'); rpcClient.abortRevert(); }}>
                  Abort Revert
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {canDrop && (
              <>
                <ContextMenu.Item
                  className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                  disabled={isOperationInProgress}
                  onSelect={() => {
                    trackCommitMenu('dropCommit');
                    void drop.start();
                  }}
                >
                  Drop Commit
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('copyHash'); rpcClient.copyToClipboard(commit.hash); }}>
              Copy Commit Hash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('copyShortHash'); rpcClient.copyToClipboard(commit.abbreviatedHash); }}>
              Copy Short Hash
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('copyMessage'); rpcClient.copyToClipboard(commit.subject); }}>
              Copy Commit Message
            </ContextMenu.Item>

            {showReset && (
              <>
                <ContextMenu.Separator className={menuSeparatorClass} />
                <ContextMenu.Sub>
                  <ContextMenu.SubTrigger className={menuItemClass}>
                    Reset Current Branch to Here
                  </ContextMenu.SubTrigger>
                  <ContextMenu.Portal>
                    <ContextMenu.SubContent className={`min-w-[160px] ${menuContentClass}`}>
                      <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('resetSoft'); handleResetSelect('soft'); }}>
                        Soft (keep staged)
                      </ContextMenu.Item>
                      <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('resetMixed'); handleResetSelect('mixed'); }}>
                        Mixed (keep unstaged)
                      </ContextMenu.Item>
                      <ContextMenu.Item className={menuItemClass} onSelect={() => { trackCommitMenu('resetHard'); handleResetSelect('hard'); }}>
                        Hard (discard all)
                      </ContextMenu.Item>
                    </ContextMenu.SubContent>
                  </ContextMenu.Portal>
                </ContextMenu.Sub>
              </>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>

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

      <RebaseConfirmDialog
        open={rebaseOntoConfirmOpen}
        onConfirm={handleRebaseOntoCommitConfirm}
        onCancel={() => setRebaseOntoConfirmOpen(false)}
        title="Rebase Current Branch onto Commit"
        description={`Rebase the current branch onto commit ${commit.abbreviatedHash}? This will rewrite commit history. Pushed commits will require a force-push.`}
        targetRef={commit.hash}
      />

      {interactiveRebase.dialog}
      {revert.dialog}
      {drop.dialog}
    </>
  );
}
