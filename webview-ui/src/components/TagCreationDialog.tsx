import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';

interface TagCreationDialogProps {
  open: boolean;
  commit: Commit;
  onClose: () => void;
}

export function TagCreationDialog({ open, commit, onClose }: TagCreationDialogProps) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('Tag name is required');
      return;
    }
    if (trimmedName.startsWith('-')) {
      setNameError('Tag name cannot start with -');
      return;
    }
    rpcClient.createTag(trimmedName, commit.hash, message.trim() || undefined);
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setName('');
      setMessage('');
      setNameError(undefined);
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Create Tag
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <div>
              <label className="block text-sm text-[var(--vscode-foreground)] mb-1">
                Tag name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
                placeholder="v1.0.0"
                autoFocus
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
              />
              {nameError && (
                <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{nameError}</p>
              )}
            </div>
            <div>
              <label className="block text-sm text-[var(--vscode-foreground)] mb-1">
                Annotation message{' '}
                <span className="text-[var(--vscode-descriptionForeground)]">(optional — leave blank for lightweight tag)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Release notes or description..."
                rows={3}
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)] resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Dialog.Close
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                type="button"
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              >
                Create Tag
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
