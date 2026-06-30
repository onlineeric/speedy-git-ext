import { useState, useMemo } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildDeleteTagCommand, buildDeleteTagWithRemoteCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';

interface DeleteTagDialogProps {
  open: boolean;
  tagName: string;
  /** Remote to delete from; when absent the "also delete from remote" option is hidden (no remote configured). */
  remote?: string;
  onConfirm: (deleteRemote?: { remote: string }) => void;
  onCancel: () => void;
}

export function DeleteTagDialog({ open, tagName, remote, onConfirm, onCancel }: DeleteTagDialogProps) {
  const [deleteRemote, setDeleteRemote] = useState(true);

  const commandPreview = useMemo(() => {
    if (deleteRemote && remote) {
      return buildDeleteTagWithRemoteCommand({ name: tagName, remote });
    }
    return buildDeleteTagCommand({ name: tagName });
  }, [tagName, deleteRemote, remote]);

  const handleConfirm = () => {
    onConfirm(deleteRemote && remote ? { remote } : undefined);
    setDeleteRemote(true);
  };

  const handleCancel = () => {
    setDeleteRemote(true);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Delete Tag
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Are you sure you want to delete tag '{tagName}'?
          </AlertDialog.Description>

          {remote && (
            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteRemote}
                  onChange={(e) => setDeleteRemote(e.target.checked)}
                  className="accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Also delete from remote ({remote})
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
              Delete
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
