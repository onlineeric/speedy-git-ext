import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { buildCheckoutCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogOverlayClassName,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface CheckoutWithPullDialogProps {
  open: boolean;
  branchName: string;
  upstream?: string;
  onConfirm: (pull: boolean) => void;
  onCancel: () => void;
}

const customDialogContentStyle = { ...dialogContentStyle, width: '38rem' };

export function CheckoutWithPullDialog({ open, branchName, upstream, onConfirm, onCancel }: CheckoutWithPullDialogProps) {
  const dialogTelemetry = useDialogTelemetry('checkoutWithPull', open);
  const [pull, setPull] = useState(true);

  const handleConfirm = () => {
    dialogTelemetry.confirmed();
    onConfirm(pull);
    setPull(true);
  };

  const handleCancel = () => {
    dialogTelemetry.cancelled();
    setPull(true);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayClassName} />
        <AlertDialog.Content
          className={dialogContentClassName}
          style={customDialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Checkout Branch
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Checkout local branch &apos;{branchName}&apos;.{' '}
            {upstream
              ? `Pull updates it from its configured upstream (${upstream}), which may differ from the remote badge you clicked.`
              : 'No upstream is configured. Pull uses your Git configuration and may require an upstream; No pull only switches branches.'}
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
              className={buttonSecondaryClassName}
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={buttonPrimaryClassName}
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
