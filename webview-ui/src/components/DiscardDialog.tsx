import type { FileChange } from '@shared/types';
import { buildDiscardFilesCommand } from '../utils/gitCommandBuilder';
import { ConfirmDialog } from './ConfirmDialog';

interface DiscardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: FileChange | null;
  onConfirm: () => void;
}

export function DiscardDialog({ open, onOpenChange, file, onConfirm }: DiscardDialogProps) {
  if (!file) return null;

  const isUntracked = file.status === 'untracked';
  const command = isUntracked
    ? `git clean -f -- ${file.path}`
    : buildDiscardFilesCommand([file.path]);

  const description = isUntracked
    ? `${file.path}\n\nThis will permanently delete this untracked file.`
    : `${file.path}\n\nThis will permanently discard all unstaged changes to this file. This cannot be undone.`;

  return (
    <ConfirmDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={() => onOpenChange(false)}
      title="Discard Changes"
      description={description}
      confirmLabel="Discard"
      variant="danger"
      commandPreview={command}
    />
  );
}
