import { buildDiscardAllUnstagedCommand } from '../utils/gitCommandBuilder';
import { ConfirmDialog } from './ConfirmDialog';

interface DiscardAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Override the dialog title. Default: "Discard All Unstaged Changes". */
  title?: string;
  /** Override the descriptive body text. Default: whole-working-tree warning. */
  description?: string;
  /** Override the primary action button label. Default: "Discard All". */
  confirmLabel?: string;
  /** Override the command preview shown in the dialog. Default: buildDiscardAllUnstagedCommand(). */
  commandPreview?: string;
}

const DEFAULT_DESCRIPTION =
  'This will permanently discard all unstaged changes and delete all untracked files. This cannot be undone.';

export function DiscardAllDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Discard All Unstaged Changes',
  description = DEFAULT_DESCRIPTION,
  confirmLabel = 'Discard All',
  commandPreview,
}: DiscardAllDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onConfirm={onConfirm}
      onCancel={() => onOpenChange(false)}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      variant="danger"
      commandPreview={commandPreview ?? buildDiscardAllUnstagedCommand()}
    />
  );
}
