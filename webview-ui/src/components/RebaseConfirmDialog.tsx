import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildRebaseCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface RebaseConfirmDialogProps {
  open: boolean;
  onConfirm: (ignoreDate: boolean) => void;
  onCancel: () => void;
  title: string;
  description: string;
  targetRef?: string;
}

export function RebaseConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  targetRef,
}: RebaseConfirmDialogProps) {
  const dialogTelemetry = useDialogTelemetry('rebase', open);
  const [ignoreDate, setIgnoreDate] = useState(false);

  const handleConfirm = () => {
    dialogTelemetry.confirmed();
    onConfirm(ignoreDate);
    setIgnoreDate(false);
  };

  const handleCancel = () => {
    dialogTelemetry.cancelled();
    setIgnoreDate(false);
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
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {description}
          </AlertDialog.Description>
          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ignoreDate}
              onChange={(e) => setIgnoreDate(e.target.checked)}
              className="w-4 h-4 accent-[var(--vscode-button-background)]"
            />
            <span className="text-sm text-[var(--vscode-foreground)]">Ignore Date</span>
            <span
              className="text-xs text-[var(--vscode-descriptionForeground)]"
              title="Rebased commits will use the current timestamp instead of preserving the original commit dates."
            >
              (use current timestamp for rebased commits)
            </span>
          </label>
          {targetRef && (
            <div className="mt-4">
              <CommandPreview command={buildRebaseCommand({ targetRef, ignoreDate })} />
            </div>
          )}
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
              Rebase
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
