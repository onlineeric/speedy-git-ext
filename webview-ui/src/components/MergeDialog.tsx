import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { MergeOptions } from '@shared/types';
import { buildMergeCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

interface MergeDialogProps {
  open: boolean;
  branchName: string;
  onConfirm: (options: MergeOptions) => void;
  onCancel: () => void;
}

export function MergeDialog({ open, branchName, onConfirm, onCancel }: MergeDialogProps) {
  const [noCommit, setNoCommit] = useState(false);
  const [noFastForward, setNoFastForward] = useState(false);

  const handleConfirm = () => {
    onConfirm({ noCommit, noFastForward: noCommit ? true : noFastForward });
    setNoCommit(false);
    setNoFastForward(false);
  };

  const handleCancel = () => {
    setNoCommit(false);
    setNoFastForward(false);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Merge Branch
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Merge &apos;{branchName}&apos; into the current branch?
          </AlertDialog.Description>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noCommit}
                onChange={(e) => setNoCommit(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">No commits, stage changes only</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer select-none ${noCommit ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={noCommit ? true : noFastForward}
                disabled={noCommit}
                onChange={(e) => setNoFastForward(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">Create a new commit even if fast forward is possible</span>
            </label>
          </div>

          <div className="mt-4">
            <CommandPreview command={buildMergeCommand({ branch: branchName, noCommit, noFastForward: noCommit ? true : noFastForward })} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
              onClick={handleConfirm}
            >
              Merge
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
