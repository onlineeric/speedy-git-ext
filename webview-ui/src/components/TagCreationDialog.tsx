import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import { validateGitTagName } from '@shared/gitRefValidation';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { buildTagCommand } from '../utils/gitCommandBuilder';
import { resolveDefaultRemoteName } from '../utils/resolveDefaultRemote';
import { deriveRefNameField } from '../utils/refNameField';
import { CommandPreview } from './CommandPreview';
import { FieldError } from './FieldError';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface TagCreationDialogProps {
  open: boolean;
  commit: Commit;
  onClose: () => void;
}

export function TagCreationDialog({ open, commit, onClose }: TagCreationDialogProps) {
  const dialogTelemetry = useDialogTelemetry('createTag', open);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [push, setPush] = useState(true);
  const [force, setForce] = useState(false);

  const remotes = useGraphStore((s) => s.remotes);
  const hasRemote = remotes.length > 0;
  const remote = resolveDefaultRemoteName(remotes);
  const trimmedName = name.trim();
  const { error: nameError, valid: canCreate } = deriveRefNameField(name, validateGitTagName);

  const resetState = () => {
    setName('');
    setMessage('');
    setPush(true);
    setForce(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      return;
    }
    dialogTelemetry.confirmed();
    const pushOption = hasRemote && push ? { remote, force } : undefined;
    rpcClient.createTag(trimmedName, commit.hash, message.trim() || undefined, pushOption);
    resetState();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      dialogTelemetry.cancelled();
      resetState();
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={`${dialogContentClassName} max-h-[90vh]`}
          style={dialogContentStyle}
        >
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
                onChange={(e) => setName(e.target.value)}
                placeholder="v1.0.0"
                autoFocus
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'tag-name-error' : undefined}
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
              />
              <FieldError id="tag-name-error" message={nameError} />
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
                className="w-full min-h-[4.75rem] px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)] resize-y"
              />
            </div>
            {hasRemote && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={push}
                    onChange={(e) => setPush(e.target.checked)}
                    className="accent-[var(--vscode-button-background)]"
                  />
                  <span className="text-sm text-[var(--vscode-foreground)]">
                    Also push to remote ({remote})
                  </span>
                </label>
                {push && (
                  <label className="flex items-center gap-2 cursor-pointer select-none ml-6">
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
                )}
              </div>
            )}
            <div className="mt-3">
              <CommandPreview command={buildTagCommand({
                name: trimmedName || '<name>',
                hash: commit.abbreviatedHash,
                ...(message.trim() ? { message: message.trim() } : {}),
                ...(hasRemote && push ? { push: { remote, force } } : {}),
              })} />
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
                disabled={!canCreate}
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
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
