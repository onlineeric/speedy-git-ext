import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { DialogId } from '@shared/telemetry';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import { CommandPreview } from './CommandPreview';
import {
  buttonDangerClassName,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
} from './dialogStyles';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning';
  commandPreview?: string;
  /** Dialog-outcome telemetry id (049-usage-telemetry); omit to disable tracking. */
  telemetryId?: DialogId;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  variant = 'warning',
  commandPreview,
  telemetryId,
}: ConfirmDialogProps) {
  const dialogTelemetry = useDialogTelemetry(telemetryId, open);
  const confirmButtonClass = variant === 'danger' ? buttonDangerClassName : buttonPrimaryClassName;

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) return;
        dialogTelemetry.cancelled();
        onCancel();
      }}
    >
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
          {commandPreview && (
            <div className="mt-4">
              <CommandPreview command={commandPreview} />
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className={buttonSecondaryClassName}
              onClick={onCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={confirmButtonClass}
              onClick={() => {
                dialogTelemetry.confirmed();
                onConfirm();
              }}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
