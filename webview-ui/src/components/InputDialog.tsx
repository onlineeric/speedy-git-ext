import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CommandPreview } from './CommandPreview';
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
  const [error, setError] = useState<string>();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (validate) {
      const err = validate(trimmed);
      if (err) {
        setError(err);
        return;
      }
    }
    onSubmit(trimmed);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onCancel();
      setValue(defaultValue);
      setError(undefined);
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
              onChange={(e) => {
                setValue(e.target.value);
                setError(undefined);
              }}
              placeholder={placeholder}
              autoFocus
              className="w-full px-2 py-1.5 text-sm rounded bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] focus:outline-none focus:border-[var(--vscode-focusBorder)]"
            />
            {error && (
              <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">{error}</p>
            )}
            {buildCommandPreview && (
              <div className="mt-3">
                <CommandPreview command={buildCommandPreview(value.trim())} />
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
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
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
