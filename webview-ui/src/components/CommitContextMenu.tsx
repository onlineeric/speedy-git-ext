import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { Commit, ResetMode } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { ConfirmDialog } from './ConfirmDialog';
import { InputDialog } from './InputDialog';
import { TagCreationDialog } from './TagCreationDialog';

interface CommitContextMenuProps {
  commit: Commit;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

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
  const [pendingResetMode, setPendingResetMode] = useState<ResetMode | null>(null);

  const branches = useGraphStore((s) => s.branches);
  const currentLocalBranch = branches.find((b) => b.current && !b.remote) ?? null;
  const hasRemoteUpstream =
    currentLocalBranch !== null &&
    branches.some((b) => b.name === currentLocalBranch.name && !!b.remote);
  const showReset =
    currentLocalBranch !== null && commit.hash !== currentLocalBranch.hash;

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
    </>
  );
}
