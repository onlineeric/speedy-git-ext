import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import { validateGitBranchName } from '@shared/gitRefValidation';
import { rpcClient } from '../rpc/rpcClient';
import { buildCreateBranchCommand } from '../utils/gitCommandBuilder';
import { deriveRefNameField } from '../utils/refNameField';
import { CommandPreview } from './CommandPreview';
import { FieldError } from './FieldError';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface CreateBranchDialogProps {
  open: boolean;
  commit: Commit;
  onClose: () => void;
}

export function CreateBranchDialog({ open, commit, onClose }: CreateBranchDialogProps) {
  const dialogTelemetry = useDialogTelemetry('createBranch', open);
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(false);

  const trimmedName = name.trim();
  const { error: nameError, valid: canCreate } = deriveRefNameField(name, validateGitBranchName);
  const commandPreview = buildCreateBranchCommand({
    name: trimmedName || '<name>',
    startPoint: commit.abbreviatedHash,
    checkout,
  });

  const reset = () => {
    setName('');
    setCheckout(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      return;
    }
    dialogTelemetry.confirmed();
    rpcClient.createBranch(trimmedName, commit.hash, checkout);
    reset();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      dialogTelemetry.cancelled();
      reset();
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Create Branch
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-3 space-y-3">
            <div>
              <label className="block text-sm text-[var(--vscode-foreground)] mb-1">
                Branch name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="feature/my-branch"
                autoFocus
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'branch-name-error' : undefined}
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
              />
              <FieldError id="branch-name-error" message={nameError} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checkout}
                onChange={(e) => setCheckout(e.target.checked)}
                className="accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">
                Checkout this branch after creating
              </span>
            </label>
            <div>
              <CommandPreview command={commandPreview} />
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
                Create Branch
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
