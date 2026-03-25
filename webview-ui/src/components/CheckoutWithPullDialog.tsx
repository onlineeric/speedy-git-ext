import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildCheckoutCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

interface CheckoutWithPullDialogProps {
  open: boolean;
  branchName: string;
  onConfirm: (pull: boolean) => void;
  onCancel: () => void;
}

export function CheckoutWithPullDialog({ open, branchName, onConfirm, onCancel }: CheckoutWithPullDialogProps) {
  const [pull, setPull] = useState(true);

  const handleConfirm = () => {
    onConfirm(pull);
    setPull(true);
  };

  const handleCancel = () => {
    setPull(true);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Checkout Branch
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Checkout branch &apos;{branchName}&apos;
          </AlertDialog.Description>

          <div className="mt-4 flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="pull-option"
                checked={pull}
                onChange={() => setPull(true)}
                className="accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">Pull</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="pull-option"
                checked={!pull}
                onChange={() => setPull(false)}
                className="accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">No pull</span>
            </label>
          </div>

          <div className="mt-4">
            <CommandPreview command={buildCheckoutCommand({ branch: branchName, pull })} />
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
              Checkout
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
