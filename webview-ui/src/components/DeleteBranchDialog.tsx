import { useState, useMemo } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildDeleteBranchCommand, buildDeleteBranchWithRemoteCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

interface DeleteBranchDialogProps {
  open: boolean;
  branchName: string;
  force?: boolean;
  remoteBranch?: { remote: string; name: string };
  initialDeleteRemote?: boolean;
  onConfirm: (deleteRemote?: { remote: string; name: string }) => void;
  onCancel: () => void;
}

export function DeleteBranchDialog({
  open,
  branchName,
  force,
  remoteBranch,
  initialDeleteRemote = false,
  onConfirm,
  onCancel,
}: DeleteBranchDialogProps) {
  const [deleteRemote, setDeleteRemote] = useState(initialDeleteRemote);

  const commandPreview = useMemo(() => {
    if (deleteRemote && remoteBranch) {
      return buildDeleteBranchWithRemoteCommand({
        name: branchName,
        force,
        remote: remoteBranch.remote,
        remoteBranchName: remoteBranch.name,
      });
    }
    return buildDeleteBranchCommand({ name: branchName, force });
  }, [branchName, force, deleteRemote, remoteBranch]);

  const title = force ? 'Force Delete Branch' : 'Delete Branch';
  const description = force
    ? `Branch '${branchName}' is not fully merged. Force deleting it may permanently remove unmerged commits from this branch reference. Continue?`
    : `Are you sure you want to delete branch '${branchName}'?`;
  const confirmLabel = force ? 'Force Delete' : 'Delete';

  const handleConfirm = () => {
    onConfirm(deleteRemote && remoteBranch ? remoteBranch : undefined);
    setDeleteRemote(false);
  };

  const handleCancel = () => {
    setDeleteRemote(false);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {description}
          </AlertDialog.Description>

          {remoteBranch && (
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteRemote}
                  onChange={(e) => setDeleteRemote(e.target.checked)}
                  className="accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Also delete remote branch ({remoteBranch.remote}/{remoteBranch.name})
                </span>
              </label>
            </div>
          )}

          <div className="mt-4">
            <CommandPreview command={commandPreview} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-errorForeground)] text-white hover:opacity-90"
              onClick={handleConfirm}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
