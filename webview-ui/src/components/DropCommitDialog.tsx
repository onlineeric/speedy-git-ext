import * as Dialog from '@radix-ui/react-dialog';
import { buildDropCommitCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface DropCommitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitHash: string;
  commitSubject: string;
  isPushed: boolean;
  onConfirm: () => void;
}

export function DropCommitDialog({
  open,
  onOpenChange,
  commitHash,
  commitSubject,
  isPushed,
  onConfirm,
}: DropCommitDialogProps) {
  const dialogTelemetry = useDialogTelemetry('dropCommit', open);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) dialogTelemetry.cancelled();
        onOpenChange(isOpen);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Drop Commit
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {commitHash.slice(0, 7)} - {commitSubject}
          </Dialog.Description>
          <div className="mt-4 space-y-3 text-sm text-[var(--vscode-foreground)]">
            <p>This rewrites branch history by removing the selected commit.</p>
            {isPushed && (
              <p className="rounded border border-[var(--vscode-errorForeground)]/40 px-3 py-2 text-[var(--vscode-editorWarning-foreground)]">
                This commit exists on a remote branch. You will need to force-push after dropping it.
              </p>
            )}
          </div>
          <div className="mt-4">
            <CommandPreview command={buildDropCommitCommand({ hash: commitHash.slice(0, 7) })} />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                dialogTelemetry.confirmed();
                onConfirm();
              }}
              className="rounded bg-[var(--vscode-errorForeground)] px-3 py-1.5 text-sm text-white hover:opacity-90"
            >
              Drop Commit
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
