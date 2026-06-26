import { useState, useEffect, useMemo } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, CherryPickOptions, ResetMode, RebaseEntry, CommitParentInfo, RevertOptions, SlotValue } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { buildResetCommand, buildCheckoutCommand } from '../utils/gitCommandBuilder';
import { ensureComparePanelOpen, setSlotsAndCompare } from '../utils/compareDispatch';
import { slotsEqual } from '../utils/compareSlot';
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
import { menuItemClass, menuItemDisabledClass, menuSeparatorClass } from './menuStyles';
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

export function CommitContextMenu({ commit, children }: CommitContextMenuProps) {
  return (
    <LazyContextMenu body={<CommitContextMenuBody commit={commit} />}>
      {children}
    </LazyContextMenu>
  );
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
  const [interactiveRebaseOpen, setInteractiveRebaseOpen] = useState(false);
  const [interactiveRebaseEntries, setInteractiveRebaseEntries] = useState<RebaseEntry[]>([]);
  const [awaitingRebaseEntries, setAwaitingRebaseEntries] = useState(false);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertParents, setRevertParents] = useState<CommitParentInfo[]>([]);
  const [dropDialogOpen, setDropDialogOpen] = useState(false);
  const [dropCommitPushed, setDropCommitPushed] = useState(false);

  const branches = useGraphStore((s) => s.branches);
  const commits = useGraphStore((s) => s.commits);
  const selectedCommits = useGraphStore((s) => s.selectedCommits);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const clearSelectedCommits = useGraphStore((s) => s.clearSelectedCommits);
  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const revertInProgress = useGraphStore((s) => s.revertInProgress);
  const cherryPickInProgress = useGraphStore((s) => s.cherryPickInProgress);
  const pendingRebaseEntries = useGraphStore((s) => s.pendingRebaseEntries);
  const compareSelection = useGraphStore((s) => s.compareSelection);
  const setSlotA = useGraphStore((s) => s.setSlotA);
  const loading = useGraphStore((s) => s.loading);

  useEffect(() => {
    if (awaitingRebaseEntries && pendingRebaseEntries !== undefined) {
      const timeout = window.setTimeout(() => {
        setInteractiveRebaseEntries(pendingRebaseEntries);
        useGraphStore.getState().setPendingRebaseEntries(undefined);
        setAwaitingRebaseEntries(false);
        setInteractiveRebaseOpen(true);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [awaitingRebaseEntries, pendingRebaseEntries]);

  useEffect(() => {
    return () => {
      useGraphStore.getState().setPendingRebaseEntries(undefined);
    };
  }, []);

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

  const handleStartInteractiveRebase = () => {
    setAwaitingRebaseEntries(true);
    rpcClient.getRebaseCommits(commit.hash);
  };

  const isMultiSelectActive =
    selectedCommits.length > 1 && selectedCommits.includes(commit.hash);

  const hasSelectedMergeCommit = isMultiSelectActive &&
    mergedCommits.some((item) => selectedCommits.includes(item.hash) && item.parents.length > 1);

  // Compare-refs (042-compare-refs)
  const compareSlotForThisCommit: SlotValue = { kind: 'commit', hash: commit.hash };
  const aSet = compareSelection.a !== null;
  const sameAsA = aSet && (
    slotsEqual(compareSelection.a, compareSlotForThisCommit) ||
    (compareSelection.aResolvedHash !== null && compareSelection.aResolvedHash === commit.hash)
  );

  const handleSetAsBase = () => {
    setSlotA(compareSlotForThisCommit);
    ensureComparePanelOpen();
  };

  const handleCompareWithBase = () => {
    if (!compareSelection.a || sameAsA) return;
    setSlotsAndCompare(compareSelection.a, compareSlotForThisCommit);
  };

  // FR-015 (Session 2026-05-09): "Compare these commits" sets Base = oldest selected,
  // Target = newest selected — direct mental model "compare the commits I selected."
  const handleCompareRange = () => {
    if (selectedCommits.length < 2) return;
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

  const handleRevertSelect = async () => {
    if (!canRevert || isOperationInProgress) return;
    // For merge commits, fetch parents so the inline picker can render names + subjects.
    // For non-merge commits, parents is left empty; the dialog hides the picker.
    if (isMergeCommit) {
      try {
        const parents = await rpcClient.getCommitParents(commit.parents);
        setRevertParents(parents);
      } catch {
        // Store error state is already set by the RPC client.
        return;
      }
    } else {
      setRevertParents([]);
    }
    setRevertDialogOpen(true);
  };

  const handleRevertConfirm = (options: RevertOptions) => {
    if (options.mode !== 'edit-message') {
      setRevertDialogOpen(false);
    }
    rpcClient.revert(commit.hash, options);
  };

  const handleDropSelect = async () => {
    if (!canDrop || isOperationInProgress) return;
    try {
      const pushed = await rpcClient.isCommitPushed(commit.hash);
      setDropCommitPushed(pushed);
      setDropDialogOpen(true);
    } catch {
      // Store error state is already set by the RPC client.
    }
  };

  return (
    <>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            {/* Compare refs (042-compare-refs) */}
            {isMultiSelectActive ? (
              <ContextMenu.Item
                className={menuItemClass}
                onSelect={handleCompareRange}
              >
                Compare these commits
              </ContextMenu.Item>
            ) : (
              <>
                <ContextMenu.Item className={menuItemClass} onSelect={handleSetAsBase}>
                  Set as Compare Base
                </ContextMenu.Item>
                {aSet && (
                  <ContextMenu.Item
                    className={sameAsA ? menuItemDisabledClass : menuItemClass}
                    disabled={sameAsA}
                    onSelect={handleCompareWithBase}
                  >
                    Compare with Base
                  </ContextMenu.Item>
                )}
              </>
            )}
            <ContextMenu.Separator className={menuSeparatorClass} />

            <ContextMenu.Item
              className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
              disabled={isOperationInProgress}
              onSelect={() => setCheckoutCommitConfirmOpen(true)}
            >
              Checkout this commit
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />

            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateBranchOpen(true)}>
              Create Branch Here...
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateTagOpen(true)}>
              Create Tag Here...
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateWorktreeOpen(true)}>
              Create worktree…
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />

            {!isHeadCommit && (
              <>
                {isMergeCommit ? (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog([commit])}
                  >
                    Cherry-Pick Commit
                  </ContextMenu.Item>
                ) : isMultiSelectActive && !hasSelectedMergeCommit ? (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog(mergedCommits.filter((item) => selectedCommits.includes(item.hash)))}
                  >
                    Cherry-Pick Selected Commits ({selectedCommits.length})
                  </ContextMenu.Item>
                ) : isMultiSelectActive && hasSelectedMergeCommit ? (
                  <ContextMenu.Item
                    className={menuItemDisabledClass}
                    disabled
                    title="Selection contains merge commits. Cherry-pick merge commits individually."
                  >
                    Cherry-Pick Selected Commits ({selectedCommits.length})
                  </ContextMenu.Item>
                ) : selectedCommits.length > 1 ? (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog([commit], true)}
                  >
                    Cherry-Pick Commit
                  </ContextMenu.Item>
                ) : (
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog([commit])}
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
                  onSelect={() => setRebaseOntoConfirmOpen(true)}
                >
                  Rebase Current Branch onto This Commit
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={isOperationInProgress ? menuItemDisabledClass : menuItemClass}
                  disabled={isOperationInProgress}
                  onSelect={handleStartInteractiveRebase}
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
                  onSelect={handleRevertSelect}
                >
                  Revert Commit
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            {revertInProgress && (
              <>
                <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.continueRevert()}>
                  Continue Revert
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.abortRevert()}>
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
                  onSelect={handleDropSelect}
                >
                  Drop Commit
                </ContextMenu.Item>
                <ContextMenu.Separator className={menuSeparatorClass} />
              </>
            )}

            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.hash)}>
              Copy Commit Hash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.abbreviatedHash)}>
              Copy Short Hash
            </ContextMenu.Item>
            <ContextMenu.Separator className={menuSeparatorClass} />
            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.subject)}>
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
                    <ContextMenu.SubContent className="min-w-[160px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
                      <ContextMenu.Item className={menuItemClass} onSelect={() => handleResetSelect('soft')}>
                        Soft (keep staged)
                      </ContextMenu.Item>
                      <ContextMenu.Item className={menuItemClass} onSelect={() => handleResetSelect('mixed')}>
                        Mixed (keep unstaged)
                      </ContextMenu.Item>
                      <ContextMenu.Item className={menuItemClass} onSelect={() => handleResetSelect('hard')}>
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

      {interactiveRebaseOpen && (
        <InteractiveRebaseDialog
          open={interactiveRebaseOpen}
          baseHash={commit.hash}
          initialEntries={interactiveRebaseEntries}
          onClose={() => {
            setInteractiveRebaseOpen(false);
            setInteractiveRebaseEntries([]);
          }}
        />
      )}

      <RevertDialog
        open={revertDialogOpen}
        commit={commit}
        parents={revertParents}
        onConfirm={handleRevertConfirm}
        onCancel={() => setRevertDialogOpen(false)}
      />

      <DropCommitDialog
        open={dropDialogOpen}
        onOpenChange={setDropDialogOpen}
        commitHash={commit.hash}
        commitSubject={commit.subject}
        isPushed={dropCommitPushed}
        onConfirm={() => {
          setDropDialogOpen(false);
          rpcClient.dropCommit(commit.hash);
        }}
      />
    </>
  );
}
