import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CommandPreview } from './CommandPreview';
import { FieldError } from './FieldError';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';

interface InputDialogProps {
  open: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  title: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
  buildCommandPreview?: (value: string) => string;
}

export function InputDialog({
  open,
  onSubmit,
  onCancel,
  title,
  label,
  defaultValue = '',
  placeholder,
  validate,
  buildCommandPreview,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue);

  const trimmed = value.trim();
  const error = trimmed && validate ? validate(trimmed) : undefined;
  const canSubmit = trimmed.length > 0 && !error;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onCancel();
      setValue(defaultValue);
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
            {title}
          </Dialog.Title>
          <form onSubmit={handleSubmit} className="mt-3">
            <label className="block text-sm text-[var(--vscode-foreground)] mb-1">
              {label}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'input-dialog-error' : undefined}
              className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            />
            <FieldError id="input-dialog-error" message={error} />
            {buildCommandPreview && (
              <div className="mt-3">
                <CommandPreview command={buildCommandPreview(trimmed)} />
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Dialog.Close
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
                type="button"
              >
                Cancel
              </Dialog.Close>
              <button
                type="submit"
                disabled={!canSubmit}
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                OK
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
