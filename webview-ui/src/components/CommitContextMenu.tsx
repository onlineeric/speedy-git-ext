import { useState, useEffect } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, CherryPickOptions, ResetMode, RebaseEntry, CommitParentInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { ConfirmDialog } from './ConfirmDialog';
import { InputDialog } from './InputDialog';
import { TagCreationDialog } from './TagCreationDialog';
import { CherryPickDialog } from './CherryPickDialog';
import { InteractiveRebaseDialog } from './InteractiveRebaseDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';
import { RevertParentDialog } from './RevertParentDialog';
import { DropCommitDialog } from './DropCommitDialog';
import { isReachableFromHead } from '../utils/commitReachability';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

const menuItemDisabledClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-disabledForeground)] cursor-not-allowed outline-none';

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
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createTagOpen, setCreateTagOpen] = useState(false);
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
  const selectedCommits = useGraphStore((s) => s.selectedCommits);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const clearSelectedCommits = useGraphStore((s) => s.clearSelectedCommits);
  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);
  const revertInProgress = useGraphStore((s) => s.revertInProgress);
  const cherryPickInProgress = useGraphStore((s) => s.cherryPickInProgress);
  const pendingRebaseEntries = useGraphStore((s) => s.pendingRebaseEntries);
  const loading = useGraphStore((s) => s.loading);

  useEffect(() => {
    if (awaitingRebaseEntries && pendingRebaseEntries !== undefined) {
      setInteractiveRebaseEntries(pendingRebaseEntries);
      useGraphStore.getState().setPendingRebaseEntries(undefined);
      setAwaitingRebaseEntries(false);
      setInteractiveRebaseOpen(true);
    }
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
  const isCommitOnCurrentBranch = currentLocalBranch
    ? isReachableFromHead(commit.hash, currentLocalBranch.hash, mergedCommits)
    : false;

  const canRebase = !isHeadCommit && !rebaseInProgress && !loading && !!currentLocalBranch;
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
    if (!isMergeCommit) {
      rpcClient.revert(commit.hash);
      return;
    }

    try {
      const parents = await rpcClient.getCommitParents(commit.parents);
      setRevertParents(parents);
      setRevertDialogOpen(true);
    } catch {
      // Store error state is already set by the RPC client.
    }
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
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[180px] py-1 rounded shadow-lg bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] z-50">
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateBranchOpen(true)}>
              Create Branch Here...
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => setCreateTagOpen(true)}>
              Create Tag Here...
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />

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
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
              </>
            )}

            {canRebase && (
              <>
                <ContextMenu.Item
                  className={menuItemClass}
                  onSelect={() => setRebaseOntoConfirmOpen(true)}
                >
                  Rebase Current Branch onto This Commit
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={menuItemClass}
                  onSelect={handleStartInteractiveRebase}
                >
                  Start Interactive Rebase from Here
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
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
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
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
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
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
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
              </>
            )}

            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.hash)}>
              Copy Commit Hash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.abbreviatedHash)}>
              Copy Short Hash
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
            <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.copyToClipboard(commit.subject)}>
              Copy Commit Message
            </ContextMenu.Item>

            {showReset && (
              <>
                <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
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
      </ContextMenu.Root>

      <InputDialog
        open={createBranchOpen}
        onSubmit={(name) => {
          setCreateBranchOpen(false);
          rpcClient.createBranch(name, commit.hash);
        }}
        onCancel={() => setCreateBranchOpen(false)}
        title="Create Branch"
        label="Branch name"
        placeholder="feature/my-branch"
        validate={(value) => value.startsWith('-') ? 'Branch name cannot start with -' : undefined}
      />

      <TagCreationDialog
        open={createTagOpen}
        commit={commit}
        onClose={() => setCreateTagOpen(false)}
      />

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

      <RevertParentDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        commitHash={commit.hash}
        commitSubject={commit.subject}
        parents={revertParents}
        onConfirm={(mainlineParent) => {
          setRevertDialogOpen(false);
          rpcClient.revert(commit.hash, mainlineParent);
        }}
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
