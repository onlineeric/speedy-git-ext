import * as Dialog from '@radix-ui/react-dialog';
import type { CommitParentInfo } from '@shared/types';

interface RevertParentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitHash: string;
  commitSubject: string;
  parents: CommitParentInfo[];
  onConfirm: (mainlineParent: number) => void;
}

export function RevertParentDialog({
  open,
  onOpenChange,
  commitHash,
  commitSubject,
  parents,
  onConfirm,
}: RevertParentDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-xl">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Revert Merge Commit
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {commitHash.slice(0, 7)} - {commitSubject}
          </Dialog.Description>
          <div className="mt-4 space-y-2">
            {parents.map((parent, index) => (
              <button
                key={parent.hash}
                type="button"
                onClick={() => onConfirm(index + 1)}
                className="w-full rounded border border-[var(--vscode-panel-border)] px-3 py-2 text-left hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                <div className="text-sm text-[var(--vscode-foreground)]">
                  Parent {index + 1}: <span className="font-mono">{parent.abbreviatedHash}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--vscode-descriptionForeground)]">
                  {parent.subject}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Dialog.Close className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
              Cancel
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
