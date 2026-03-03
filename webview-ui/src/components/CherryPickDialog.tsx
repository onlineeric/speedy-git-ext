import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit, CherryPickOptions } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';

interface CherryPickDialogProps {
  open: boolean;
  commits: Commit[];
  onConfirm: (options: CherryPickOptions) => void;
  onCancel: () => void;
}

export function CherryPickDialog({ open, commits, onConfirm, onCancel }: CherryPickDialogProps) {
  const setCherryPickOptions = useGraphStore((s) => s.setCherryPickOptions);
  const mergedCommits = useGraphStore((s) => s.mergedCommits);

  const [appendSourceRef, setAppendSourceRef] = useState(false);
  const [noCommit, setNoCommit] = useState(false);
  const [mainlineParent, setMainlineParent] = useState(1);

  const isSingleMergeCommit = commits.length === 1 && commits[0].parents.length > 1;

  // Read the stored options snapshot when the dialog opens; reset mainlineParent
  useEffect(() => {
    if (!open) return;
    const { cherryPickOptions } = useGraphStore.getState();
    setAppendSourceRef(cherryPickOptions.appendSourceRef);
    setNoCommit(cherryPickOptions.noCommit);
    setMainlineParent(1);
  }, [open]);

  const handleConfirm = () => {
    const options: CherryPickOptions = {
      appendSourceRef,
      noCommit,
      ...(isSingleMergeCommit ? { mainlineParent } : {}),
    };
    setCherryPickOptions(options);
    onConfirm(options);
  };

  const commitSummary =
    commits.length === 1
      ? `${commits[0].abbreviatedHash} — ${commits[0].subject}`
      : `${commits.length} commits`;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Cherry-Pick {commits.length > 1 ? `${commits.length} Commits` : 'Commit'}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {commitSummary}
          </Dialog.Description>

          {isSingleMergeCommit && (
            <div className="mt-4 mb-4">
              <p className="text-sm text-[var(--vscode-foreground)] mb-2 font-medium">
                Select mainline parent
              </p>
              <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-2">
                Choose which parent is the mainline (the branch this merge was made into).
              </p>
              <div className="space-y-1">
                {commits[0].parents.map((parentHash, i) => {
                  const parentNum = i + 1;
                  const parentCommit = mergedCommits.find((c) => c.hash === parentHash);
                  const label = parentCommit
                    ? `${parentCommit.abbreviatedHash} — ${parentCommit.subject}`
                    : parentHash.slice(0, 7);
                  return (
                    <label key={parentHash} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="mainlineParent"
                        value={parentNum}
                        checked={mainlineParent === parentNum}
                        onChange={() => setMainlineParent(parentNum)}
                        className="cursor-pointer"
                      />
                      <span className="text-sm text-[var(--vscode-foreground)]">
                        Parent {parentNum}: {label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={appendSourceRef}
                onChange={(e) => setAppendSourceRef(e.target.checked)}
                className="mt-0.5 cursor-pointer"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">
                Append source commit reference{' '}
                {noCommit && (
                  <span className="text-xs text-[var(--vscode-descriptionForeground)]">
                    (ignored when staging only)
                  </span>
                )}
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noCommit}
                onChange={(e) => setNoCommit(e.target.checked)}
                className="cursor-pointer"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">
                Stage changes only (do not commit)
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={onCancel}
            >
              Cancel
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
            >
              Cherry-Pick
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
