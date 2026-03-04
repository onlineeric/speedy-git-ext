import { useState, useCallback, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import type { RebaseEntry, SquashGroupMessage, InteractiveRebaseConfig } from '@shared/types';
import { InteractiveRebaseRow } from './InteractiveRebaseRow';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';

interface InteractiveRebaseDialogProps {
  open: boolean;
  baseHash: string;
  initialEntries: RebaseEntry[];
  onClose: () => void;
}

type Step = 1 | 2 | 3;

const buttonPrimary = 'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]';
const buttonSecondary = 'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]';

function buildSquashMessages(entries: RebaseEntry[]): SquashGroupMessage[] {
  const groups: SquashGroupMessage[] = [];
  let currentLeadHash: string | null = null;
  let currentMessages: string[] = [];

  for (const entry of entries) {
    if (entry.action === 'drop') continue;

    if (entry.action === 'pick' || entry.action === 'reword') {
      if (currentLeadHash && currentMessages.length > 1) {
        groups.push({ groupLeadHash: currentLeadHash, combinedMessage: currentMessages.join('\n\n') });
      }
      currentLeadHash = entry.hash;
      currentMessages = [entry.action === 'reword' && entry.rewordMessage ? entry.rewordMessage : entry.subject];
    } else if (entry.action === 'squash') {
      currentMessages.push(entry.subject);
    }
    // fixup: silently discard
  }

  if (currentLeadHash && currentMessages.length > 1) {
    groups.push({ groupLeadHash: currentLeadHash, combinedMessage: currentMessages.join('\n\n') });
  }

  return groups;
}

function validateStep1(entries: RebaseEntry[]): string | null {
  const nonDropped = entries.filter((e) => e.action !== 'drop');
  if (nonDropped.length === 0) return null; // will show warning on next
  const first = nonDropped[0];
  if (first.action === 'squash' || first.action === 'fixup') {
    return 'First commit cannot be squashed — change the action or move a pick above it';
  }
  for (const entry of entries) {
    if (entry.action === 'reword' && !entry.rewordMessage?.trim()) {
      return 'Commit message cannot be empty for reword entries';
    }
  }
  return null;
}

export function InteractiveRebaseDialog({ open, baseHash, initialEntries, onClose }: InteractiveRebaseDialogProps) {
  const [step, setStep] = useState<Step>(1);
  const [entries, setEntries] = useState<RebaseEntry[]>(() => initialEntries);
  const [squashMessages, setSquashMessages] = useState<SquashGroupMessage[]>([]);
  const [allDropWarningShown, setAllDropWarningShown] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const lastStep2EntriesRef = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEntries((prev) => {
        const oldIndex = prev.findIndex((e) => e.hash === active.id);
        const newIndex = prev.findIndex((e) => e.hash === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  const handleEntryChange = useCallback((hash: string, updates: Partial<RebaseEntry>) => {
    setEntries((prev) => prev.map((e) => e.hash === hash ? { ...e, ...updates } : e));
    setValidationError(null);
  }, []);

  const handleNext = () => {
    const error = validateStep1(entries);
    if (error) {
      setValidationError(error);
      return;
    }

    const allDropped = entries.every((e) => e.action === 'drop');
    if (allDropped && !allDropWarningShown) {
      setAllDropWarningShown(true);
      setValidationError('Warning: all commits will be dropped. Your branch will be reset to the base commit with no new history. Click Next again to proceed.');
      return;
    }

    const entriesKey = JSON.stringify(entries);
    const entriesChanged = entriesKey !== lastStep2EntriesRef.current;

    let activeSquashMessages = squashMessages;
    if (entriesChanged || squashMessages.length === 0) {
      activeSquashMessages = buildSquashMessages(entries);
      setSquashMessages(activeSquashMessages);
      lastStep2EntriesRef.current = entriesKey;
    }

    setValidationError(null);
    setAllDropWarningShown(false);
    setStep(activeSquashMessages.length > 0 ? 2 : 3);
  };

  const handleSquashMessageChange = (leadHash: string, message: string) => {
    setSquashMessages((prev) => prev.map((m) => m.groupLeadHash === leadHash ? { ...m, combinedMessage: message } : m));
  };

  const handleStart = () => {
    const config: InteractiveRebaseConfig = { baseHash, entries, squashMessages };
    useGraphStore.getState().setLoading(true);
    rpcClient.interactiveRebase(config);
    onClose();
  };

  const handleClose = () => {
    setStep(1);
    setValidationError(null);
    setAllDropWarningShown(false);
    onClose();
  };

  const abbrevBase = baseHash.slice(0, 7);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-2xl max-h-[80vh] flex flex-col p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50">
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)] mb-1">
            Interactive Rebase
          </Dialog.Title>

          {/* Step indicator */}
          <div className="flex gap-2 text-xs text-[var(--vscode-descriptionForeground)] mb-4">
            <span className={step === 1 ? 'text-[var(--vscode-foreground)] font-medium' : ''}>1. Configure</span>
            <span>→</span>
            <span className={step === 2 ? 'text-[var(--vscode-foreground)] font-medium' : ''}>2. Squash Messages</span>
            <span>→</span>
            <span className={step === 3 ? 'text-[var(--vscode-foreground)] font-medium' : ''}>3. Confirm</span>
          </div>

          <div className="flex-1 overflow-auto min-h-0">
            {step === 1 && (
              <div>
                <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
                  Drag to reorder commits. Assign actions for each entry.
                </p>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={entries.map((e) => e.hash)} strategy={verticalListSortingStrategy}>
                    {entries.map((entry, idx) => (
                      <InteractiveRebaseRow
                        key={entry.hash}
                        entry={entry}
                        isFirst={idx === 0}
                        onChange={handleEntryChange}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {validationError && (
                  <p className="text-xs text-[var(--vscode-inputValidation-errorForeground)] mt-2">{validationError}</p>
                )}
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-xs text-[var(--vscode-descriptionForeground)] mb-3">
                  Review and edit the combined commit messages for squash groups.
                </p>
                {squashMessages.map((group) => (
                  <div key={group.groupLeadHash} className="mb-4">
                    <label className="block text-xs font-medium text-[var(--vscode-foreground)] mb-1">
                      Squash group starting at {group.groupLeadHash.slice(0, 7)}
                    </label>
                    <textarea
                      value={group.combinedMessage}
                      onChange={(e) => handleSquashMessageChange(group.groupLeadHash, e.target.value)}
                      rows={4}
                      className="w-full text-xs p-2 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] resize-y"
                    />
                  </div>
                ))}
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-sm text-[var(--vscode-foreground)] mb-3">
                  Rebase {entries.filter((e) => e.action !== 'drop').length} commit(s) from{' '}
                  <code className="font-mono text-xs">{abbrevBase}</code>.
                </p>
                <div className="p-3 rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] text-xs text-[var(--vscode-foreground)]">
                  ⚠️ This will rewrite commit history. Pushed commits will require a force-push.
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-[var(--vscode-panel-border)]">
            <button
              onClick={handleClose}
              className={buttonSecondary}
            >
              Cancel
            </button>
            {step === 1 && (
              <button
                onClick={handleNext}
                className={buttonPrimary}
              >
                Next
              </button>
            )}
            {step === 2 && (
              <>
                <button
                  onClick={() => setStep(1)}
                  className={buttonSecondary}
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className={buttonPrimary}
                >
                  Next
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <button
                  onClick={() => setStep(squashMessages.length > 0 ? 2 : 1)}
                  className={buttonSecondary}
                >
                  Back
                </button>
                <button
                  onClick={handleStart}
                  className={buttonPrimary}
                >
                  Start Rebase
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
