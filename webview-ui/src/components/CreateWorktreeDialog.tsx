import { useState, useEffect, useMemo, useCallback } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { WorktreeBranchMode, WorktreeInfo } from '@shared/types';
import { validateGitBranchName } from '@shared/gitRefValidation';
import { buildAddWorktreeCommand } from '../utils/gitCommandBuilder';
import { deriveRefNameField } from '../utils/refNameField';
import { WORKTREE_FOLDER_MISSING_TOOLTIP } from '../utils/worktreeDisplay';
import { rpcClient } from '../rpc/rpcClient';
import { CommandPreview } from './CommandPreview';
import { FieldError } from './FieldError';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

export type WorktreeSourceKind = 'local-branch' | 'remote-branch' | 'commit' | 'tag';

export interface WorktreeSource {
  /** The git ref the worktree is based on: branch name, `origin/x`, tag name, or commit hash. */
  ref: string;
  /** Human-readable label shown in the dialog. */
  label: string;
  kind: WorktreeSourceKind;
}

interface CreateWorktreeDialogProps {
  open: boolean;
  source: WorktreeSource;
  existingWorktree?: WorktreeInfo;
  onClose: () => void;
}

/** Available branch modes + sensible default per source kind (research R4). */
function modesForKind(kind: WorktreeSourceKind): { modes: WorktreeBranchMode[]; defaultMode: WorktreeBranchMode } {
  switch (kind) {
    case 'local-branch':
      return { modes: ['existing', 'new', 'detached'], defaultMode: 'existing' };
    case 'remote-branch':
    case 'commit':
    case 'tag':
      return { modes: ['new', 'detached'], defaultMode: 'new' };
  }
}

/** Strip a leading remote prefix (e.g. `origin/feature` → `feature`) for the default new-branch name. */
function defaultNewBranchName(source: WorktreeSource): string {
  if (source.kind === 'remote-branch') {
    const slash = source.ref.indexOf('/');
    return slash >= 0 ? source.ref.slice(slash + 1) : source.ref;
  }
  if (source.kind === 'local-branch' || source.kind === 'tag') return source.ref;
  return '';
}

function initialBranchMode(defaultMode: WorktreeBranchMode, existingBranchDisabled: boolean): WorktreeBranchMode {
  if (existingBranchDisabled && defaultMode === 'existing') return 'new';
  return defaultMode;
}

export function CreateWorktreeDialog({ open, source, existingWorktree, onClose }: CreateWorktreeDialogProps) {
  const dialogTelemetry = useDialogTelemetry('createWorktree', open);
  const { modes, defaultMode } = useMemo(() => modesForKind(source.kind), [source.kind]);
  const existingBranchDisabled = source.kind === 'local-branch' && existingWorktree !== undefined;
  const [branchMode, setBranchMode] = useState<WorktreeBranchMode>(() => initialBranchMode(defaultMode, existingBranchDisabled));
  const [newBranchName, setNewBranchName] = useState(() => defaultNewBranchName(source));
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Gitignored `.env*` files that could be copied into the new worktree, plus the
  // user's opt-in choice. `null` while the backend probe is in flight.
  const [envInfo, setEnvInfo] = useState<{ ignoredEnvFiles: string[]; envFilesPresent: boolean } | null>(null);
  const [copyEnvFiles, setCopyEnvFiles] = useState(false);

  // This dialog is mounted only while open (see call sites), so the initial
  // useState values above already seed fresh state per open — no reset effect needed.

  // Ask the backend to compose the target path; re-runs when the mode or new-branch
  // name changes. Non-blocking — the dialog is already rendered. Superseded requests
  // reject and are ignored.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    rpcClient
      .resolveWorktreePath({ ref: source.ref, branchMode, newBranchName: newBranchName || undefined })
      .then((resolved) => {
        if (!cancelled) setPath(resolved.path);
      })
      .catch(() => {
        /* superseded / disposed — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [open, source.ref, branchMode, newBranchName]);

  // Probe once per open for gitignored `.env*` files. The dialog is mounted only while
  // open, so this runs on mount; superseded/disposed probes reject and are ignored.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    rpcClient
      .getWorktreeEnvFiles()
      .then((info) => {
        if (!cancelled) setEnvInfo(info);
      })
      .catch(() => {
        /* superseded / disposed — ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const envCopyEnabled = (envInfo?.ignoredEnvFiles.length ?? 0) > 0;
  // Light-grey hint shown after the checkbox label. Names the files that will be copied,
  // or explains why the checkbox is disabled. `null` while the probe is in flight.
  const envHint = !envInfo
    ? null
    : envCopyEnabled
      ? `(${envInfo.ignoredEnvFiles.join(', ')})`
      : envInfo.envFilesPresent
        ? ' - (no .env* file is git-ignored)'
        : ' - (no .env* file found)';

  const trimmedName = newBranchName.trim();
  const branchNameField = deriveRefNameField(newBranchName, validateGitBranchName);
  const nameError = branchMode === 'new' ? branchNameField.error : undefined;
  const nameInvalid = branchMode === 'new' && !branchNameField.valid;
  const canConfirm = path.trim().length > 0 && !nameInvalid && !busy;

  const commandPreview = useMemo(
    () => buildAddWorktreeCommand({ path: path || '<path>', ref: source.ref, branchMode, newBranchName: trimmedName }),
    [path, source.ref, branchMode, trimmedName],
  );

  const handleConfirm = useCallback(async () => {
    dialogTelemetry.confirmed();
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const done = rpcClient.awaitNextDialogAction();
    rpcClient.addWorktree({
      path: path.trim(),
      ref: source.ref,
      branchMode,
      newBranchName: branchMode === 'new' ? trimmedName : undefined,
      copyEnvFiles: envCopyEnabled && copyEnvFiles,
    });
    try {
      await done;
      onClose();
    } catch (e) {
      if (e === 'superseded' || e === 'dialog-closed') return;
      setError(typeof e === 'string' ? e : (e as Error).message);
      setBusy(false);
    }
  }, [canConfirm, path, source.ref, branchMode, trimmedName, envCopyEnabled, copyEnvFiles, onClose, dialogTelemetry]);

  const handleCancel = useCallback(() => {
    dialogTelemetry.cancelled();
    rpcClient.clearPendingDialogAction();
    onClose();
  }, [onClose, dialogTelemetry]);

  const handleOpenExistingWorktree = useCallback(() => {
    if (!existingWorktree || existingWorktree.isPrunable) return;
    rpcClient.openWorktree(existingWorktree.path);
    handleCancel();
  }, [existingWorktree, handleCancel]);

  const modeLabel: Record<WorktreeBranchMode, string> = {
    existing: `Use existing branch "${source.ref}"`,
    new: 'Create a new branch',
    detached: `Detached HEAD at ${source.label}`,
  };

  const customDialogContentStyle = { ...dialogContentStyle, width: '68rem' };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content
          className={dialogContentClassName}
          style={customDialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Create Worktree
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Source: <span className="font-mono">{source.label}</span>
          </AlertDialog.Description>

          <div className="mt-4 space-y-2">
            {modes.map((mode) => {
              const modeDisabled = mode === 'existing' && existingBranchDisabled;
              return (
                <div key={mode} className="flex min-h-7 flex-wrap items-start gap-x-1.5 gap-y-1">
                  <label
                    className={`flex min-w-0 items-start gap-2 select-none ${modeDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                    title={modeDisabled ? `Branch "${source.ref}" is already checked out in a worktree.` : undefined}
                  >
                    <input
                      type="radio"
                      name="worktree-branch-mode"
                      checked={branchMode === mode}
                      disabled={modeDisabled}
                      onChange={() => setBranchMode(mode)}
                      className="mt-0.5 accent-[var(--vscode-button-background)] disabled:cursor-not-allowed"
                    />
                    <span className={`text-sm ${modeDisabled ? 'text-[var(--vscode-disabledForeground)]' : 'text-[var(--vscode-foreground)]'}`}>
                      {modeLabel[mode]}
                    </span>
                  </label>
                  {modeDisabled && existingWorktree && (
                    <span className="text-sm text-[var(--vscode-descriptionForeground)]">
                      ; Worktree for this branch exists,{' '}
                      <button
                        type="button"
                        disabled={existingWorktree.isPrunable}
                        onClick={handleOpenExistingWorktree}
                        title={existingWorktree.isPrunable ? WORKTREE_FOLDER_MISSING_TOOLTIP : existingWorktree.path}
                        className="rounded px-1 py-0.5 text-xs text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Open the worktree in new window
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {branchMode === 'new' && (
            <div className="mt-3">
              <label className="text-sm text-[var(--vscode-descriptionForeground)]">New branch name</label>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'worktree-branch-name-error' : undefined}
                className="mt-1 w-full px-2 py-1 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
                placeholder="my-feature"
              />
              <FieldError id="worktree-branch-name-error" message={nameError} />
            </div>
          )}

          <div className="mt-3">
            <label className="text-sm text-[var(--vscode-descriptionForeground)]">Worktree folder</label>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="mt-1 w-full px-2 py-1 text-sm font-mono rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
            />
          </div>

          <div className="mt-4">
            <CommandPreview command={commandPreview} />
          </div>

          <div className="mt-5 flex min-h-7 flex-wrap items-start gap-x-1.5 gap-y-1">
            <label
              className={`flex min-w-0 items-start gap-2 select-none ${envCopyEnabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <input
                type="checkbox"
                checked={envCopyEnabled && copyEnvFiles}
                disabled={!envCopyEnabled}
                onChange={(e) => setCopyEnvFiles(e.target.checked)}
                className="mt-0.5 accent-[var(--vscode-button-background)] disabled:cursor-not-allowed"
              />
              <span className={`text-sm ${envCopyEnabled ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-disabledForeground)]'}`}>
                Copy git ignored .env* files into the new worktree
              </span>
            </label>
            {envHint && (
              <span className="text-sm text-[var(--vscode-descriptionForeground)]">{envHint}</span>
            )}
          </div>

          <p className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
            The worktree will open in a new window.
          </p>

          {error && (
            <p className="mt-3 text-sm text-[var(--vscode-errorForeground)]">{error}</p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            {/* Plain button (not AlertDialog.Action) so the dialog stays open on failure. */}
            <button
              type="button"
              disabled={!canConfirm}
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleConfirm}
            >
              {busy ? 'Creating…' : 'Create Worktree'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
