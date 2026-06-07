import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { buildCreateBranchCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';

interface CreateBranchDialogProps {
  open: boolean;
  commit: Commit;
  onClose: () => void;
}

export function CreateBranchDialog({ open, commit, onClose }: CreateBranchDialogProps) {
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const trimmedName = name.trim();
  const commandPreview = buildCreateBranchCommand({
    name: trimmedName || '<name>',
    startPoint: commit.abbreviatedHash,
    checkout,
  });

  const reset = () => {
    setName('');
    setCheckout(false);
    setNameError(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName) {
      setNameError('Branch name is required');
      return;
    }
    if (trimmedName.startsWith('-')) {
      setNameError('Branch name cannot start with -');
      return;
    }
    rpcClient.createBranch(trimmedName, commit.hash, checkout);
    reset();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
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
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError(undefined);
                }}
                placeholder="feature/my-branch"
                autoFocus
                className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
              />
              {nameError && (
                <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{nameError}</p>
              )}
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
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
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
