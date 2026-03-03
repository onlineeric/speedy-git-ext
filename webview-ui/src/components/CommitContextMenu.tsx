import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, CherryPickOptions, ResetMode } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { ConfirmDialog } from './ConfirmDialog';
import { InputDialog } from './InputDialog';
import { TagCreationDialog } from './TagCreationDialog';
import { CherryPickDialog } from './CherryPickDialog';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

const menuItemDisabledClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-disabledForeground)] cursor-not-allowed outline-none';

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

  const branches = useGraphStore((s) => s.branches);
  const selectedCommits = useGraphStore((s) => s.selectedCommits);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const clearSelectedCommits = useGraphStore((s) => s.clearSelectedCommits);

  const currentLocalBranch = branches.find((b) => b.current && !b.remote) ?? null;
  const hasRemoteUpstream =
    currentLocalBranch !== null &&
    branches.some((b) => b.name === currentLocalBranch.name && !!b.remote);
  const showReset =
    currentLocalBranch !== null && commit.hash !== currentLocalBranch.hash;

  const isHeadCommit = commit.hash === currentLocalBranch?.hash;
  const isMergeCommit = commit.parents.length > 1;

  const isMultiSelectActive =
    selectedCommits.length > 1 && selectedCommits.includes(commit.hash);

  const hasSelectedMergeCommit = isMultiSelectActive &&
    mergedCommits.some((c) => selectedCommits.includes(c.hash) && c.parents.length > 1);

  const handleCopyHash = () => {
    rpcClient.copyToClipboard(commit.hash);
  };

  const handleCopyShortHash = () => {
    rpcClient.copyToClipboard(commit.abbreviatedHash);
  };

  const handleCopyMessage = () => {
    rpcClient.copyToClipboard(commit.subject);
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
    // Sort selected hashes oldest-first using mergedCommits order (newest-first → reverse)
    const hashSet = new Set(cherryPickCommits.map((c) => c.hash));
    const orderedHashes = mergedCommits
      .filter((c) => hashSet.has(c.hash))
      .map((c) => c.hash)
      .reverse();
    rpcClient.cherryPick(orderedHashes, options);
    clearSelectedCommits();
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
            {/* Cherry-pick items */}
            {!isHeadCommit && (
              <>
                {isMergeCommit ? (
                  // Single merge commit — enable with parent selection in dialog
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog([commit])}
                  >
                    Cherry-Pick Commit
                  </ContextMenu.Item>
                ) : isMultiSelectActive && !hasSelectedMergeCommit ? (
                  // Multi-select, no merge commits
                  <ContextMenu.Item
                    className={menuItemClass}
                    onSelect={() => openCherryPickDialog(mergedCommits.filter((c) => selectedCommits.includes(c.hash)))}
                  >
                    Cherry-Pick Selected Commits ({selectedCommits.length})
                  </ContextMenu.Item>
                ) : isMultiSelectActive && hasSelectedMergeCommit ? (
                  // Multi-select includes merge commits — keep disabled
                  <ContextMenu.Item
                    className={menuItemDisabledClass}
                    disabled
                    title="Selection contains merge commits. Cherry-pick merge commits individually."
                  >
                    Cherry-Pick Selected Commits ({selectedCommits.length})
                  </ContextMenu.Item>
                ) : selectedCommits.length > 1 ? (
                  // Right-clicked an unselected commit while multi-select is active
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
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyHash}>
              Copy Commit Hash
            </ContextMenu.Item>
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyShortHash}>
              Copy Short Hash
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px my-1 bg-[var(--vscode-menu-separatorBackground)]" />
            <ContextMenu.Item className={menuItemClass} onSelect={handleCopyMessage}>
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
        validate={(v) => v.startsWith('-') ? 'Branch name cannot start with -' : undefined}
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
    </>
  );
}
