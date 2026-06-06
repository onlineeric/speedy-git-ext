import { useState, useEffect, useMemo, useCallback } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { WorktreeBranchMode } from '@shared/types';
import { buildAddWorktreeCommand } from '../utils/gitCommandBuilder';
import { rpcClient } from '../rpc/rpcClient';
import { CommandPreview } from './CommandPreview';
import { dialogContentStyle } from './dialogStyles';

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

export function CreateWorktreeDialog({ open, source, onClose }: CreateWorktreeDialogProps) {
  const { modes, defaultMode } = useMemo(() => modesForKind(source.kind), [source.kind]);
  const [branchMode, setBranchMode] = useState<WorktreeBranchMode>(defaultMode);
  const [newBranchName, setNewBranchName] = useState(() => defaultNewBranchName(source));
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const trimmedName = newBranchName.trim();
  const nameInvalid = branchMode === 'new' && (trimmedName.length === 0 || trimmedName.startsWith('-'));
  const canConfirm = path.trim().length > 0 && !nameInvalid && !busy;

  const commandPreview = useMemo(
    () => buildAddWorktreeCommand({ path: path || '<path>', ref: source.ref, branchMode, newBranchName: trimmedName }),
    [path, source.ref, branchMode, trimmedName],
  );

  const handleConfirm = useCallback(async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const done = rpcClient.awaitNextDialogAction();
    rpcClient.addWorktree({
      path: path.trim(),
      ref: source.ref,
      branchMode,
      newBranchName: branchMode === 'new' ? trimmedName : undefined,
    });
    try {
      await done;
      onClose();
    } catch (e) {
      if (e === 'superseded' || e === 'dialog-closed') return;
      setError(typeof e === 'string' ? e : (e as Error).message);
      setBusy(false);
    }
  }, [canConfirm, path, source.ref, branchMode, trimmedName, onClose]);

  const handleCancel = useCallback(() => {
    rpcClient.clearPendingDialogAction();
    onClose();
  }, [onClose]);

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
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50"
          style={customDialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Create Worktree
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Source: <span className="font-mono">{source.label}</span>
          </AlertDialog.Description>

          <div className="mt-4 space-y-2">
            {modes.map((mode) => (
              <label key={mode} className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="worktree-branch-mode"
                  checked={branchMode === mode}
                  onChange={() => setBranchMode(mode)}
                  className="mt-0.5 accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">{modeLabel[mode]}</span>
              </label>
            ))}
          </div>

          {branchMode === 'new' && (
            <div className="mt-3">
              <label className="text-sm text-[var(--vscode-descriptionForeground)]">New branch name</label>
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                className="mt-1 w-full px-2 py-1 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
                placeholder="my-feature"
              />
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

          <p className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">
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
