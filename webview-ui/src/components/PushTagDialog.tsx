import { useState, useMemo } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildPushTagCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface PushTagDialogProps {
  open: boolean;
  tagName: string;
  remote: string;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

/** Standalone "Push Tag" dialog with an opt-in Force toggle (default off) for
 *  overwriting a tag that diverged on the remote (048-tag-enhancements US4). */
export function PushTagDialog({ open, tagName, remote, onConfirm, onCancel }: PushTagDialogProps) {
  const dialogTelemetry = useDialogTelemetry('pushTag', open);
  const [force, setForce] = useState(false);

  const commandPreview = useMemo(
    () => buildPushTagCommand({ name: tagName, remote, force }),
    [tagName, remote, force],
  );

  const handleConfirm = () => {
    dialogTelemetry.confirmed();
    onConfirm(force);
    setForce(false);
  };

  const handleCancel = () => {
    dialogTelemetry.cancelled();
    setForce(false);
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
            Push Tag
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Push tag '{tagName}' to {remote}?
          </AlertDialog.Description>

          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">
                Force (overwrite a diverged remote tag)
              </span>
            </label>
          </div>

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
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              onClick={handleConfirm}
            >
              Push
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
