import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FileChange } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { DiscardAllDialog } from './DiscardAllDialog';

interface FilePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stagedFiles: FileChange[];
  unstagedFiles: FileChange[];
}

export function FilePickerDialog({
  open,
  onOpenChange,
  stagedFiles,
  unstagedFiles,
}: FilePickerDialogProps) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const allFiles = [...stagedFiles, ...unstagedFiles];

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setSelectedPaths(new Set());
    onOpenChange(nextOpen);
  };

  const toggleFile = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAllInSection = useCallback((files: FileChange[]) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      const sectionPaths = files.map(f => f.path);
      const allSelected = sectionPaths.every(p => next.has(p));
      if (allSelected) {
        sectionPaths.forEach(p => next.delete(p));
      } else {
        sectionPaths.forEach(p => next.add(p));
      }
      return next;
    });
  }, []);

  const selectedStaged = stagedFiles.filter(f => selectedPaths.has(f.path));
  const selectedUnstaged = unstagedFiles.filter(f => selectedPaths.has(f.path));
  const hasSelection = selectedPaths.size > 0;

  const handleStage = () => {
    if (selectedUnstaged.length > 0) {
      rpcClient.stageFiles(selectedUnstaged.map(f => f.path));
    }
  };

  const handleUnstage = () => {
    if (selectedStaged.length > 0) {
      rpcClient.unstageFiles(selectedStaged.map(f => f.path));
    }
  };

  const handleStash = () => {
    // Stash operates on all changes, not selected files
    rpcClient.stashWithMessage();
  };

  const handleDiscard = () => {
    if (selectedUnstaged.length > 0) {
      setDiscardConfirmOpen(true);
    }
  };

  const handleDiscardConfirm = () => {
    const paths = selectedUnstaged.map(f => f.path);
    const hasUntracked = selectedUnstaged.some(f => f.status === 'untracked');
    rpcClient.discardFiles(paths, hasUntracked);
    setDiscardConfirmOpen(false);
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-lg max-h-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] p-6 shadow-xl flex flex-col">
            <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
              Select Files
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-[var(--vscode-descriptionForeground)]">
              Select files and choose an action to perform.
            </Dialog.Description>

            <div className="mt-4 flex-1 overflow-auto min-h-0 space-y-3">
              {stagedFiles.length > 0 && (
                <FileGroup
                  title="Staged"
                  files={stagedFiles}
                  selectedPaths={selectedPaths}
                  onToggleFile={toggleFile}
                  onToggleAll={() => toggleAllInSection(stagedFiles)}
                />
              )}
              {unstagedFiles.length > 0 && (
                <FileGroup
                  title="Unstaged"
                  files={unstagedFiles}
                  selectedPaths={selectedPaths}
                  onToggleFile={toggleFile}
                  onToggleAll={() => toggleAllInSection(unstagedFiles)}
                />
              )}
              {allFiles.length === 0 && (
                <p className="text-sm text-[var(--vscode-descriptionForeground)]">No uncommitted files.</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--vscode-panel-border)] pt-4">
              <button
                disabled={selectedUnstaged.length === 0}
                onClick={handleStage}
                className="rounded bg-[var(--vscode-button-background)] px-3 py-1.5 text-sm text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Stage ({selectedUnstaged.length})
              </button>
              <button
                disabled={selectedStaged.length === 0}
                onClick={handleUnstage}
                className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Unstage ({selectedStaged.length})
              </button>
              <button
                disabled={!hasSelection}
                onClick={handleStash}
                className="rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Stash
              </button>
              <button
                disabled={selectedUnstaged.length === 0}
                onClick={handleDiscard}
                className="rounded bg-[var(--vscode-errorForeground)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Discard ({selectedUnstaged.length})
              </button>
              <Dialog.Close className="ml-auto rounded bg-[var(--vscode-button-secondaryBackground)] px-3 py-1.5 text-sm text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]">
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
      />
    </>
  );
}

function FileGroup({
  title,
  files,
  selectedPaths,
  onToggleFile,
  onToggleAll,
}: {
  title: string;
  files: FileChange[];
  selectedPaths: Set<string>;
  onToggleFile: (path: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = files.every(f => selectedPaths.has(f.path));
  const someSelected = files.some(f => selectedPaths.has(f.path));

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-[var(--vscode-descriptionForeground)]">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
            onChange={onToggleAll}
            className="accent-[var(--vscode-focusBorder)]"
          />
          {title} ({files.length})
        </label>
      </div>
      <div className="space-y-0.5 pl-2">
        {files.map((file) => (
          <label
            key={file.path}
            className="flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 text-xs hover:bg-[var(--vscode-list-hoverBackground)]"
          >
            <input
              type="checkbox"
              checked={selectedPaths.has(file.path)}
              onChange={() => onToggleFile(file.path)}
              className="accent-[var(--vscode-focusBorder)]"
            />
            <span className="truncate font-mono">{file.path}</span>
            <span className="ml-auto text-[var(--vscode-descriptionForeground)]">
              {file.status}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
