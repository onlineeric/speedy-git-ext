import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FileChange } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { DiscardAllDialog } from './DiscardAllDialog';
import { CommandPreview } from './CommandPreview';
import { FileChangeRow, ViewModeToggle } from './FileChangeShared';
import { FileChangesTreeView } from './FileChangesTreeView';
import {
  computeRadioAvailability,
  applyDefaultRadioRule,
  type ActionKind,
  type RadioAvailability,
} from '../utils/radioAvailability';
import { buildDefaultStashMessage } from '../utils/stashMessage';
import {
  buildSelectiveStageCommand,
  buildSelectiveUnstageCommand,
  buildSelectiveDiscardCommand,
  buildSelectiveStashCommand,
} from '../utils/gitCommandBuilder';

interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
}

const RADIO_ROW_LABEL: Record<ActionKind, string> = {
  stage: 'Stage',
  unstage: 'Unstage',
  discard: 'Discard',
  stash: 'Stash with message',
};

const ACTION_BUTTON_VERB: Record<ActionKind, string> = {
  stage: 'Stage',
  unstage: 'Unstage',
  discard: 'Discard',
  stash: 'Stash',
};

const RADIO_KINDS: ActionKind[] = ['stage', 'unstage', 'discard', 'stash'];

export function FilePickerDialog(props: FilePickerDialogProps) {
  // Skip all derivation/state work when the dialog is closed. The parent
  // re-renders on every file-watcher refresh, and this dialog lives inside
  // an always-mounted context menu, so gating on `open` avoids running
  // ~10 memos/effects every time the store updates.
  if (!props.open) return null;
  return <FilePickerDialogInner {...props} />;
}

function FilePickerDialogInner({
  open,
  onOpenChange,
  stagedFiles,
  unstagedFiles,
}: FilePickerDialogProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectedRadio, setSelectedRadio] = useState<ActionKind | null>(null);
  const [stashMessage, setStashMessage] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const stashInputRef = useRef<HTMLInputElement>(null);

  const currentBranch = useGraphStore(
    (s) => s.branches.find((b) => b.current)?.name ?? 'HEAD',
  );

  const allFiles = useMemo(() => [...stagedFiles, ...unstagedFiles], [stagedFiles, unstagedFiles]);

  const stagedPathSet = useMemo(() => new Set(stagedFiles.map((f) => f.path)), [stagedFiles]);
  const unstagedPathSet = useMemo(() => new Set(unstagedFiles.map((f) => f.path)), [unstagedFiles]);

  const untrackedPathSet = useMemo(
    () => new Set(unstagedFiles.filter((f) => f.status === 'untracked').map((f) => f.path)),
    [unstagedFiles],
  );

  const hasRenamedInSet = useMemo(
    () => allFiles.some((f) => f.status === 'renamed'),
    [allFiles],
  );

  // Renamed files are auto-included in stash (both sides of the rename) so
  // the user cannot partially stash a rename and leave a broken state.
  const renamedPairsAll = useMemo(() => {
    const pairs: string[] = [];
    for (const f of allFiles) {
      if (f.status === 'renamed') {
        pairs.push(f.path);
        if (f.oldPath) pairs.push(f.oldPath);
      }
    }
    return pairs;
  }, [allFiles]);

  const effectiveStagePaths = useMemo(() => {
    const out: string[] = [];
    for (const p of selectedPaths) if (unstagedPathSet.has(p)) out.push(p);
    return out;
  }, [selectedPaths, unstagedPathSet]);

  const effectiveUnstagePaths = useMemo(() => {
    const out: string[] = [];
    for (const p of selectedPaths) if (stagedPathSet.has(p)) out.push(p);
    return out;
  }, [selectedPaths, stagedPathSet]);

  const effectiveDiscardTrackedPaths = useMemo(
    () => effectiveStagePaths.filter((p) => !untrackedPathSet.has(p)),
    [effectiveStagePaths, untrackedPathSet],
  );
  const effectiveDiscardUntrackedPaths = useMemo(
    () => effectiveStagePaths.filter((p) => untrackedPathSet.has(p)),
    [effectiveStagePaths, untrackedPathSet],
  );

  const effectiveStashPaths = useMemo(() => {
    const set = new Set<string>(selectedPaths);
    for (const p of renamedPairsAll) set.add(p);
    return [...set];
  }, [selectedPaths, renamedPairsAll]);

  const hasUntrackedInStashPaths = useMemo(
    () => effectiveStashPaths.some((p) => untrackedPathSet.has(p)),
    [effectiveStashPaths, untrackedPathSet],
  );

  const availability: RadioAvailability = useMemo(
    () => computeRadioAvailability({ selectedPaths, stagedFiles, unstagedFiles }),
    [selectedPaths, stagedFiles, unstagedFiles],
  );

  useEffect(() => {
    setSelectedRadio((prev) => applyDefaultRadioRule(availability, prev));
    setErrorBanner((prev) => (prev === null ? prev : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    availability.stageEnabled,
    availability.unstageEnabled,
    availability.discardEnabled,
    availability.stashEnabled,
  ]);

  // After a successful action the store refreshes, and the user's selection
  // is preserved so they can chain actions on the same set (e.g. Stage then
  // Unstage to undo). Paths that no longer exist in either list are pruned
  // so counts and checkboxes stay aligned with the refreshed working tree.
  useEffect(() => {
    setSelectedPaths((prev) => {
      if (prev.size === 0) return prev;
      const pruned = new Set<string>();
      for (const p of prev) {
        if (stagedPathSet.has(p) || unstagedPathSet.has(p)) pruned.add(p);
      }
      return pruned.size === prev.size ? prev : pruned;
    });
  }, [stagedPathSet, unstagedPathSet]);

  // Release any in-flight pending dialog action on close/unmount.
  useEffect(() => {
    if (!open) {
      rpcClient.clearPendingDialogAction();
    }
    return () => {
      rpcClient.clearPendingDialogAction();
    };
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedPaths(new Set());
      setStashMessage('');
      setErrorBanner(null);
      setIsRunning(false);
      setDiscardConfirmOpen(false);
    }
    onOpenChange(nextOpen);
  };

  const toggleFile = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAllInSection = useCallback((files: FileChange[]) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      const sectionPaths = files.map((f) => f.path);
      const allSelected = sectionPaths.every((p) => next.has(p));
      if (allSelected) sectionPaths.forEach((p) => next.delete(p));
      else sectionPaths.forEach((p) => next.add(p));
      return next;
    });
  }, []);

  const toggleFolderPaths = useCallback((paths: string[], checked: boolean) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) {
        paths.forEach((p) => next.add(p));
      } else {
        paths.forEach((p) => next.delete(p));
      }
      return next;
    });
  }, []);

  const resolvedStashMessage = useMemo(() => {
    const trimmed = stashMessage.trim();
    if (trimmed) return trimmed;
    return buildDefaultStashMessage(effectiveStashPaths.length, currentBranch);
  }, [stashMessage, effectiveStashPaths.length, currentBranch]);

  const previewByKind: Record<ActionKind, string> = useMemo(
    () => ({
      stage: buildSelectiveStageCommand(
        effectiveStagePaths.length ? effectiveStagePaths : ['<select files>'],
      ),
      unstage: buildSelectiveUnstageCommand(
        effectiveUnstagePaths.length ? effectiveUnstagePaths : ['<select files>'],
      ),
      discard: buildSelectiveDiscardCommand({
        trackedPaths: effectiveDiscardTrackedPaths.length
          ? effectiveDiscardTrackedPaths
          : ['<select files>'],
        untrackedPaths: effectiveDiscardUntrackedPaths,
      }),
      stash: buildSelectiveStashCommand({
        paths: effectiveStashPaths.length ? effectiveStashPaths : ['<select files>'],
        message: resolvedStashMessage,
        hasUntracked: hasUntrackedInStashPaths,
      }),
    }),
    [
      effectiveStagePaths,
      effectiveUnstagePaths,
      effectiveDiscardTrackedPaths,
      effectiveDiscardUntrackedPaths,
      effectiveStashPaths,
      hasUntrackedInStashPaths,
      resolvedStashMessage,
    ],
  );

  const countByKind: Record<ActionKind, number> = {
    stage: availability.stageCount,
    unstage: availability.unstageCount,
    discard: availability.discardCount,
    stash: availability.stashCount,
  };

  const enabledByKind: Record<ActionKind, boolean> = {
    stage: availability.stageEnabled,
    unstage: availability.unstageEnabled,
    discard: availability.discardEnabled,
    stash: availability.stashEnabled,
  };

  const runWithDialogAction = useCallback(
    async (action: () => void) => {
      setIsRunning(true);
      setErrorBanner(null);
      action();
      try {
        await rpcClient.awaitNextDialogAction();
        setStashMessage('');
      } catch (errMsg) {
        // Ignore cancellations triggered by dialog close / supersede
        if (errMsg === 'dialog-closed' || errMsg === 'superseded') {
          return;
        }
        setErrorBanner(String(errMsg));
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  const handleActionButton = useCallback(() => {
    if (!selectedRadio || isRunning) return;
    switch (selectedRadio) {
      case 'stage':
        void runWithDialogAction(() => rpcClient.stageFiles(effectiveStagePaths));
        break;
      case 'unstage':
        void runWithDialogAction(() => rpcClient.unstageFiles(effectiveUnstagePaths));
        break;
      case 'discard':
        setDiscardConfirmOpen(true);
        break;
      case 'stash':
        void runWithDialogAction(() =>
          rpcClient.stashSelected(
            resolvedStashMessage,
            effectiveStashPaths,
            hasUntrackedInStashPaths,
          ),
        );
        break;
    }
  }, [
    selectedRadio,
    isRunning,
    runWithDialogAction,
    effectiveStagePaths,
    effectiveUnstagePaths,
    effectiveStashPaths,
    hasUntrackedInStashPaths,
    resolvedStashMessage,
  ]);

  const handleDiscardConfirm = useCallback(async () => {
    setDiscardConfirmOpen(false);
    await runWithDialogAction(() =>
      rpcClient.discardFiles(
        [...effectiveDiscardTrackedPaths, ...effectiveDiscardUntrackedPaths],
        effectiveDiscardUntrackedPaths.length > 0,
      ),
    );
  }, [runWithDialogAction, effectiveDiscardTrackedPaths, effectiveDiscardUntrackedPaths]);

  // Clicking the stash-message input auto-selects the Stash radio so users
  // don't have to click twice.
  const handleStashMessageFieldClick = useCallback(() => {
    if (selectedRadio !== 'stash') {
      setSelectedRadio('stash');
      requestAnimationFrame(() => stashInputRef.current?.focus());
    }
  }, [selectedRadio]);

  const discardConfirmDescription = useMemo(() => {
    const n = effectiveDiscardTrackedPaths.length + effectiveDiscardUntrackedPaths.length;
    const untrackedCount = effectiveDiscardUntrackedPaths.length;
    const base = `This will permanently discard ${n} file(s).`;
    const untrackedNote =
      untrackedCount > 0
        ? ` ${untrackedCount} untracked file(s) will be permanently deleted.`
        : '';
    return `${base}${untrackedNote} This cannot be undone.`;
  }, [effectiveDiscardTrackedPaths.length, effectiveDiscardUntrackedPaths.length]);

  const discardConfirmLabel = useMemo(
    () =>
      `Discard (${effectiveDiscardTrackedPaths.length + effectiveDiscardUntrackedPaths.length})`,
    [effectiveDiscardTrackedPaths.length, effectiveDiscardUntrackedPaths.length],
  );

  const discardConfirmPreview = useMemo(
    () =>
      buildSelectiveDiscardCommand({
        trackedPaths: effectiveDiscardTrackedPaths,
        untrackedPaths: effectiveDiscardUntrackedPaths,
      }),
    [effectiveDiscardTrackedPaths, effectiveDiscardUntrackedPaths],
  );

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-xl">
            <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
              Select files for…
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-[var(--vscode-descriptionForeground)]">
              Select files, then pick an action.
            </Dialog.Description>

            {errorBanner && (
              <div className="mt-3 flex items-start gap-2 rounded border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-3 py-2 text-xs text-[var(--vscode-inputValidation-errorForeground)]">
                <span className="flex-1 whitespace-pre-wrap font-mono">{errorBanner}</span>
                <button
                  type="button"
                  onClick={() => setErrorBanner(null)}
                  className="shrink-0 px-1 text-sm leading-none hover:opacity-70"
                  aria-label="Dismiss error"
                >
                  ✕
                </button>
              </div>
            )}

            <div className="mt-4 flex-1 overflow-auto min-h-0 space-y-3">
              {stagedFiles.length > 0 && (
                <SelectableFileSection
                  title="Staged"
                  files={stagedFiles}
                  selectedPaths={selectedPaths}
                  disabled={isRunning}
                  onToggleFile={toggleFile}
                  onToggleAll={() => toggleAllInSection(stagedFiles)}
                  onToggleFolderPaths={toggleFolderPaths}
                />
              )}
              {unstagedFiles.length > 0 && (
                <SelectableFileSection
                  title="Unstaged"
                  files={unstagedFiles}
                  selectedPaths={selectedPaths}
                  disabled={isRunning}
                  onToggleFile={toggleFile}
                  onToggleAll={() => toggleAllInSection(unstagedFiles)}
                  onToggleFolderPaths={toggleFolderPaths}
                />
              )}
              {allFiles.length === 0 && (
                <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                  No uncommitted files.
                </p>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Action"
              className="mt-4 space-y-2 border-t border-[var(--vscode-panel-border)] pt-4"
            >
              {RADIO_KINDS.map((kind) => {
                const enabled = enabledByKind[kind] && !isRunning;
                const isSelected = selectedRadio === kind;
                return (
                  <RadioRow
                    key={kind}
                    kind={kind}
                    enabled={enabled}
                    selected={isSelected}
                    preview={previewByKind[kind]}
                    onSelect={() => {
                      if (enabled) setSelectedRadio(kind);
                    }}
                    messageInputSlot={
                      kind === 'stash' ? (
                        <input
                          ref={stashInputRef}
                          type="text"
                          value={stashMessage}
                          placeholder="Stash message (optional)"
                          onChange={(e) => setStashMessage(e.target.value)}
                          onClick={handleStashMessageFieldClick}
                          onFocus={handleStashMessageFieldClick}
                          disabled={selectedRadio !== 'stash' || isRunning}
                          readOnly={selectedRadio !== 'stash'}
                          className="mt-1 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-sm text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none disabled:opacity-60"
                        />
                      ) : null
                    }
                  />
                );
              })}
              {hasRenamedInSet && (
                <p className="pl-6 text-[11px] italic text-[var(--vscode-descriptionForeground)]">
                  Note: renamed files are always stashed as a pair and cannot be partially selected.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--vscode-panel-border)] pt-4">
              {selectedRadio !== null && (
                <button
                  type="button"
                  disabled={isRunning || !enabledByKind[selectedRadio]}
                  onClick={handleActionButton}
                  className={`rounded px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                    selectedRadio === 'discard'
                      ? 'bg-[var(--vscode-errorForeground)] text-white hover:opacity-90'
                      : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
                  }`}
                >
                  {isRunning ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Working…
                    </span>
                  ) : (
                    `${ACTION_BUTTON_VERB[selectedRadio]} (${countByKind[selectedRadio]})`
                  )}
                </button>
              )}
              <Dialog.Close className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
                Close
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <DiscardAllDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        onConfirm={handleDiscardConfirm}
        title="Discard Selected Changes"
        description={discardConfirmDescription}
        confirmLabel={discardConfirmLabel}
        commandPreview={discardConfirmPreview}
      />
    </>
  );
}

interface RadioRowProps {
  kind: ActionKind;
  enabled: boolean;
  selected: boolean;
  preview: string;
  onSelect: () => void;
  messageInputSlot?: React.ReactNode;
}

function RadioRow({ kind, enabled, selected, preview, onSelect, messageInputSlot }: RadioRowProps) {
  // Only the radio + its title live inside <label>; the preview input is a
  // sibling so users can click into it to select/copy the command text
  // without accidentally toggling the radio.
  return (
    <div className={enabled ? '' : 'opacity-50'}>
      <div className="flex items-center gap-2 text-sm">
        <label
          className={`flex items-center gap-2 ${
            enabled ? 'cursor-pointer text-[var(--vscode-foreground)]' : 'cursor-not-allowed text-[var(--vscode-descriptionForeground)]'
          }`}
        >
          <input
            type="radio"
            name="file-picker-action"
            value={kind}
            checked={selected}
            disabled={!enabled}
            onChange={onSelect}
            className="accent-[var(--vscode-focusBorder)]"
          />
          <span className="min-w-[120px] font-medium">{RADIO_ROW_LABEL[kind]}</span>
        </label>
        <div className="flex-1 min-w-0">
          <CommandPreview command={preview} showLabel={false} showCopyButton={selected} />
        </div>
      </div>
      {messageInputSlot && <div className="pl-7 pr-0">{messageInputSlot}</div>}
    </div>
  );
}

function SelectableFileSection({
  title,
  files,
  selectedPaths,
  disabled,
  onToggleFile,
  onToggleAll,
  onToggleFolderPaths,
}: {
  title: string;
  files: FileChange[];
  selectedPaths: Set<string>;
  disabled: boolean;
  onToggleFile: (path: string) => void;
  onToggleAll: () => void;
  onToggleFolderPaths: (paths: string[], checked: boolean) => void;
}) {
  const fileViewMode = useGraphStore((state) => state.fileViewMode);
  const allSelected = files.every((f) => selectedPaths.has(f.path));
  const someSelected = files.some((f) => selectedPaths.has(f.path));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-[var(--vscode-descriptionForeground)]">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            disabled={disabled}
            onChange={onToggleAll}
            className="accent-[var(--vscode-focusBorder)]"
          />
          {title} ({files.length})
        </label>
        <ViewModeToggle />
      </div>
      {fileViewMode === 'list' ? (
        <div className="space-y-0.5 pl-2">
          {files.map((file) => (
            <label
              key={file.path}
              className={`flex items-center gap-1.5 ${
                disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedPaths.has(file.path)}
                disabled={disabled}
                onChange={() => onToggleFile(file.path)}
                className="accent-[var(--vscode-focusBorder)]"
              />
              <FileChangeRow
                file={file}
                hideActions
              />
            </label>
          ))}
        </div>
      ) : (
        <div className="pl-2">
          <FileChangesTreeView
            files={files}
            selectedPaths={selectedPaths}
            onTogglePath={onToggleFile}
            onToggleFolderPaths={onToggleFolderPaths}
            hideActions
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
