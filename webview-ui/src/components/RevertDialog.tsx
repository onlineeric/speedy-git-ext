import { useState, useEffect, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit, CommitParentInfo, RevertMode, RevertOptions } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { buildRevertCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

interface RevertDialogProps {
  open: boolean;
  commit: Commit;
  parents: CommitParentInfo[];
  onConfirm: (options: RevertOptions) => void;
  onCancel: () => void;
}

/**
 * Builds the default commit message used to pre-fill the edit-message textarea.
 * Matches git's standard `git revert` message format exactly.
 */
function defaultRevertMessage(commit: Pick<Commit, 'hash' | 'subject'>): string {
  return `Revert "${commit.subject}"\n\nThis reverts commit ${commit.hash}.`;
}

export function RevertDialog({ open, commit, parents, onConfirm, onCancel }: RevertDialogProps) {
  const setRevertOptions = useGraphStore((s) => s.setRevertOptions);
  const revertOptions = useGraphStore((s) => s.revertOptions);

  const [mode, setMode] = useState<RevertMode>('commit');
  const [mainlineParent, setMainlineParent] = useState<number | null>(null);
  const [message, setMessage] = useState<string>(() => defaultRevertMessage(commit));
  // FR-012: edit-message submissions keep the dialog open until the host
  // responds, so the typed message survives an error and the user can copy
  // / edit / retry without retyping.
  const [submitting, setSubmitting] = useState(false);

  // Track whether the dialog initiated the active submission, so we ignore
  // store success/error signals that fired from unrelated activity.
  const submittedRef = useRef(false);
  const lastCommitHashRef = useRef<string | null>(null);

  const isMergeCommit = commit.parents.length > 1;

  // Load last-used mode + reset commit-specific fields whenever the dialog opens
  // or whenever it opens with a different target commit.
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      setMode(revertOptions.mode);
      setMainlineParent(null);
      if (lastCommitHashRef.current !== commit.hash) {
        setMessage(defaultRevertMessage(commit));
        lastCommitHashRef.current = commit.hash;
      }
      setSubmitting(false);
      submittedRef.current = false;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [open, revertOptions, commit]);

  // Stable callbacks for the subscriber, to keep the subscription effect's
  // dep list minimal (the subscription is the "external system" the effect
  // synchronizes with; setState happens in its callback, which the lint rule
  // permits).
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  const finishSubmission = useCallback((closeDialog: boolean) => {
    submittedRef.current = false;
    setSubmitting(false);
    if (closeDialog) onCancelRef.current();
  }, []);

  // Subscribe to the store and react to success/error signals that arrive
  // AFTER we initiated an edit-message submission.
  useEffect(() => {
    if (!submitting) return undefined;
    return useGraphStore.subscribe((state, prev) => {
      if (!submittedRef.current) return;
      if (state.successMessage && state.successMessage !== prev.successMessage) {
        finishSubmission(true);
      } else if (state.error && state.error !== prev.error) {
        finishSubmission(false);
      }
    });
  }, [submitting, finishSubmission]);

  const commandPreview = buildRevertCommand({
    hash: commit.abbreviatedHash,
    mode,
    ...(isMergeCommit && mainlineParent !== null ? { mainlineParent } : {}),
  });

  const messageEmpty = mode === 'edit-message' && message.trim().length === 0;
  const confirmDisabled =
    submitting || (isMergeCommit && mainlineParent === null) || messageEmpty;

  const handleConfirm = () => {
    if (confirmDisabled) return;
    const options: RevertOptions = {
      mode,
      ...(isMergeCommit && mainlineParent !== null ? { mainlineParent } : {}),
      ...(mode === 'edit-message' ? { message } : {}),
    };
    setRevertOptions({ mode });

    if (mode === 'edit-message') {
      // Keep the dialog open until the host responds — FR-012.
      submittedRef.current = true;
      setSubmitting(true);
      onConfirm(options);
    } else {
      onConfirm(options);
    }
  };

  const title = isMergeCommit ? 'Revert Merge Commit' : 'Revert Commit';

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && !submitting && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            {title}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {commit.abbreviatedHash} — {commit.subject}
          </Dialog.Description>

          {isMergeCommit && (
            <div className="mt-4 mb-4">
              <p className="text-sm text-[var(--vscode-foreground)] mb-2 font-medium">
                Select mainline parent
              </p>
              <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-2">
                Choose which parent is the mainline (the branch this merge was made into).
              </p>
              <div className="space-y-1">
                {parents.map((parent, i) => {
                  const parentNum = i + 1;
                  return (
                    <label key={parent.hash} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="revertMainlineParent"
                        value={parentNum}
                        checked={mainlineParent === parentNum}
                        onChange={() => setMainlineParent(parentNum)}
                        className="cursor-pointer"
                      />
                      <span className="text-sm text-[var(--vscode-foreground)]">
                        Parent {parentNum}: <span className="font-mono">{parent.abbreviatedHash}</span> — {parent.subject}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4">
            <p className="text-sm text-[var(--vscode-foreground)] mb-2 font-medium">
              Mode
            </p>
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revertMode"
                  value="commit"
                  checked={mode === 'commit'}
                  onChange={() => setMode('commit')}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Commit now{' '}
                  <span className="font-mono text-xs text-[var(--vscode-descriptionForeground)]">
                    (--no-edit)
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revertMode"
                  value="no-commit"
                  checked={mode === 'no-commit'}
                  onChange={() => setMode('no-commit')}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Stage only{' '}
                  <span className="font-mono text-xs text-[var(--vscode-descriptionForeground)]">
                    (--no-commit)
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="revertMode"
                  value="edit-message"
                  checked={mode === 'edit-message'}
                  onChange={() => setMode('edit-message')}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Edit message{' '}
                  <span className="font-mono text-xs text-[var(--vscode-descriptionForeground)]">
                    (no flag; opens editor natively)
                  </span>
                </span>
              </label>
            </div>
          </div>

          {mode === 'edit-message' && (
            <div className="mt-3">
              <label className="block text-xs text-[var(--vscode-descriptionForeground)] mb-1">
                Commit message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full px-2 py-1 text-sm font-mono rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] resize-y"
              />
              {messageEmpty && (
                <p className="mt-1 text-xs text-[var(--vscode-errorForeground)]">
                  Commit message is required.
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <CommandPreview command={commandPreview} />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Dialog.Close
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onCancel}
              disabled={submitting}
            >
              Cancel
            </Dialog.Close>
            <button
              onClick={handleConfirm}
              disabled={confirmDisabled}
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Reverting…' : 'Revert'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
