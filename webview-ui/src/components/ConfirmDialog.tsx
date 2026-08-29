import { useRef } from 'react';
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
  /**
   * Focus the confirm button on open instead of Cancel.
   *
   * Radix focuses `AlertDialog.Cancel` by design, which is the safer default for a
   * destructive confirmation. Set this only where proceeding is the expected answer
   * and Enter should carry it out.
   */
  focusConfirm?: boolean;
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
  focusConfirm = false,
}: ConfirmDialogProps) {
  const dialogTelemetry = useDialogTelemetry(telemetryId, open);
  const confirmButtonClass = variant === 'danger' ? buttonDangerClassName : buttonPrimaryClassName;
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

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
          onOpenAutoFocus={
            focusConfirm
              ? (event) => {
                  event.preventDefault();
                  confirmButtonRef.current?.focus();
                }
              : undefined
          }
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
              ref={confirmButtonRef}
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
