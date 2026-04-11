import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { buildStashWithMessageCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

interface StashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (message?: string) => void;
  /** Override the dialog title. Default: "Stash All Changes". */
  title?: string;
  /** Override the descriptive body text. Default: "Stash all changes including untracked files." */
  description?: string;
}

export function StashDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Stash All Changes',
  description = 'Stash all changes including untracked files.',
}: StashDialogProps) {
  const [message, setMessage] = useState('');

  const handleConfirm = () => {
    onConfirm(message.trim() || undefined);
    setMessage('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setMessage('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {description}
          </Dialog.Description>
          <div className="mt-4">
            <label className="mb-1 block text-xs text-[var(--vscode-descriptionForeground)]">
              Message (optional)
            </label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Stash message..."
              className="w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1.5 text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirm();
              }}
              autoFocus
            />
          </div>
          <div className="mt-4">
            <CommandPreview command={buildStashWithMessageCommand({ message: message.trim() || undefined })} />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              className="rounded bg-[var(--vscode-button-background)] px-3 py-1.5 text-sm text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              Stash
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
