import { buildDiscardAllUnstagedCommand } from '../utils/gitCommandBuilder';
import { ConfirmDialog } from './ConfirmDialog';

interface DiscardAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DiscardAllDialog({ open, onOpenChange, onConfirm }: DiscardAllDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={() => onOpenChange(false)}
      title="Discard All Unstaged Changes"
      description="This will permanently discard all unstaged changes and delete all untracked files. This cannot be undone."
      confirmLabel="Discard All"
      variant="danger"
      commandPreview={buildDiscardAllUnstagedCommand()}
    />
  );
}
