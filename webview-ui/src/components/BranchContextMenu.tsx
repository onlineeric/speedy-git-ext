import { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { RefInfo } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { ConfirmDialog } from './ConfirmDialog';
import { InputDialog } from './InputDialog';
import { RebaseConfirmDialog } from './RebaseConfirmDialog';

// Returns true if ancestorHash appears before descendantHash in the commits list
// (commits list is newest-first, so ancestor has a HIGHER index)
function isAncestorInList(ancestorHash: string, descendantHash: string, commits: { hash: string }[]): boolean {
  const ancestorIdx = commits.findIndex((c) => c.hash === ancestorHash);
  const descendantIdx = commits.findIndex((c) => c.hash === descendantHash);
  if (ancestorIdx === -1 || descendantIdx === -1) return false;
  return ancestorIdx > descendantIdx;
}

interface BranchContextMenuProps {
  refInfo: RefInfo;
  children: React.ReactNode;
}

const menuItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-menu-foreground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';
const dangerItemClass =
  'px-3 py-1.5 text-sm text-[var(--vscode-errorForeground)] cursor-pointer outline-none hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]';

export function BranchContextMenu({ refInfo, children }: BranchContextMenuProps) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [rebaseConfirmOpen, setRebaseConfirmOpen] = useState(false);
  const loading = useGraphStore((s) => s.loading);
  const branches = useGraphStore((s) => s.branches);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);
  const rebaseInProgress = useGraphStore((s) => s.rebaseInProgress);

  const displayName = refInfo.remote
    ? `${refInfo.remote}/${refInfo.name}`
    : refInfo.name;

  const handleCheckout = () => {
    rpcClient.checkoutBranch(refInfo.name, refInfo.remote);
  };

  const handleCopyName = () => {
    rpcClient.copyToClipboard(displayName);
  };

  const isCurrentBranch = refInfo.type === 'head';
  const isLocalBranch = refInfo.type === 'branch' || isCurrentBranch;
  const isRemoteBranch = refInfo.type === 'remote';
  const isBranch = isLocalBranch || isRemoteBranch;
  const isTag = refInfo.type === 'tag';
  const isStash = refInfo.type === 'stash';

  // Standard rebase: show only for non-current branches/remotes/tags that aren't already ancestors of HEAD
  const currentLocalBranch = branches.find((b) => b.current && !b.remote) ?? null;
  const targetBranch = branches.find((b) => b.name === refInfo.name && b.remote === refInfo.remote);
  const targetHash = targetBranch?.hash;
  const headHash = currentLocalBranch?.hash;
  const canRebaseOnto =
    !isCurrentBranch &&
    !rebaseInProgress &&
    !loading &&
    isBranch &&
    !!targetHash &&
    !!headHash &&
    !isAncestorInList(targetHash, headHash, mergedCommits);

  const handleRebaseConfirm = (ignoreDate: boolean) => {
    setRebaseConfirmOpen(false);
    useGraphStore.getState().setLoading(true);
    rpcClient.rebase(displayName, ignoreDate);
  };

  return (
    <>
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
                  <ContextMenu.Item className={menuItemClass} onSelect={() => setMergeConfirmOpen(true)}>
                    Merge into Current Branch
                  </ContextMenu.Item>
                )}
                <ContextMenu.Item className={menuItemClass} onSelect={() => setRenameOpen(true)}>
                  Rename Branch...
                </ContextMenu.Item>
                <ContextMenu.Item className={menuItemClass} onSelect={() => rpcClient.push(undefined, refInfo.name)}>
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

      {/* Merge confirmation */}
      <ConfirmDialog
        open={mergeConfirmOpen}
        onConfirm={() => {
          setMergeConfirmOpen(false);
          rpcClient.mergeBranch(refInfo.name);
        }}
        onCancel={() => setMergeConfirmOpen(false)}
        title="Merge Branch"
        description={`Merge '${refInfo.name}' into the current branch?`}
        confirmLabel="Merge"
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
