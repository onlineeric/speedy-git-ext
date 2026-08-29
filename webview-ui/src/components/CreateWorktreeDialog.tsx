import { useState, useEffect, useMemo, useCallback } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { WORKTREE_FOLDER_NAME_STYLES, type WorktreeBranchMode, type WorktreeFolderNameStyle, type WorktreeInfo } from '@shared/types';
import { validateGitBranchName } from '@shared/gitRefValidation';
import { buildAddWorktreeCommand } from '../utils/gitCommandBuilder';
import { deriveRefNameField } from '../utils/refNameField';
import { WORKTREE_FOLDER_MISSING_TOOLTIP } from '../utils/worktreeDisplay';
import {
  computedPathFor,
  decideStyleSwitch,
  saveDefaultLink,
  WORKTREE_STYLE_LABELS,
  type ResolvedWorktreePaths,
} from '../utils/worktreePathChoice';
import type { WorktreeSource, WorktreeSourceKind } from '../utils/refWorktreeSource';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { CommandPreview } from './CommandPreview';
import { ConfirmDialog } from './ConfirmDialog';
import { FieldError } from './FieldError';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

// The source types live beside the pure derivation in `utils/refWorktreeSource`;
// re-exported here so existing importers of this dialog keep working.
export type { WorktreeSource, WorktreeSourceKind } from '../utils/refWorktreeSource';

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

// A text-styled inline action inside the dialog body (not a dialog button, which
// would pull the eye away from the primary action). Spelled once for both call sites.
const linkButtonClassName =
  'rounded px-1 py-0.5 text-xs text-[var(--vscode-textLink-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)]';

const folderInputClassName =
  'w-full px-2 py-1 text-sm font-mono rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]';

function initialBranchMode(defaultMode: WorktreeBranchMode, existingBranchDisabled: boolean): WorktreeBranchMode {
  if (existingBranchDisabled && defaultMode === 'existing') return 'new';
  return defaultMode;
}

export function CreateWorktreeDialog({ open, source, existingWorktree, onClose }: CreateWorktreeDialogProps) {
  const dialogTelemetry = useDialogTelemetry('createWorktree', open);
  const configuredStyle = useGraphStore((s) => s.userSettings.worktreeFolderNameStyle);
  const { modes, defaultMode } = useMemo(() => modesForKind(source.kind), [source.kind]);
  const existingBranchDisabled = source.kind === 'local-branch' && existingWorktree !== undefined;
  const [branchMode, setBranchMode] = useState<WorktreeBranchMode>(() => initialBranchMode(defaultMode, existingBranchDisabled));
  const [newBranchName, setNewBranchName] = useState(() => defaultNewBranchName(source));
  // Both candidate folders, as the backend last computed them, plus whether the
  // choice applies at all. `null` until the first resolve answers.
  const [resolved, setResolved] = useState<ResolvedWorktreePaths | null>(null);
  // The text in each box. Only the selected one is editable; the other always shows
  // its computed default (see `worktreePathChoice`).
  const [paths, setPaths] = useState<{ nested: string; flat: string }>({ nested: '', flat: '' });
  // Seeded once per open, so the selection resets to the configured style every time
  // the dialog is opened and a later settings broadcast cannot move it mid-edit.
  const [style, setStyle] = useState<WorktreeFolderNameStyle>(() => configuredStyle);
  // The style a pending discard confirmation would switch to; null when none is open.
  const [pendingStyle, setPendingStyle] = useState<WorktreeFolderNameStyle | null>(null);
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
      .then((next) => {
        if (cancelled) return;
        // Overwriting both boxes is what silently discards a manual edit when the
        // branch name or mode changes — the branch name is the source of truth for
        // the suggestion, and confirming on every keystroke would be unusable.
        setResolved(next);
        setPaths({ nested: next.nestedPath, flat: next.flatPath });
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

  // `paths` is keyed by style name, so the selected box is a direct lookup.
  const activePath = paths[style];
  const showStyleChoice = resolved?.hierarchical === true;
  const link = saveDefaultLink({
    hierarchical: showStyleChoice,
    selected: style,
    configured: configuredStyle,
  });

  const setActivePath = useCallback(
    (value: string) => {
      setPaths((current) => ({ ...current, [style]: value }));
    },
    [style],
  );

  /** Move to `next`, restoring the box being left to its computed default (§5.1). */
  const applyStyleSwitch = useCallback(
    (next: WorktreeFolderNameStyle) => {
      setPaths((current) => ({ ...current, [style]: computedPathFor(resolved, style) }));
      setStyle(next);
    },
    [style, resolved],
  );

  const handleStyleClick = useCallback(
    (next: WorktreeFolderNameStyle) => {
      const verdict = decideStyleSwitch({
        current: style,
        next,
        currentText: activePath,
        computed: computedPathFor(resolved, style),
      });
      if (verdict === 'ignore') return;
      if (verdict === 'switch') {
        applyStyleSwitch(next);
        return;
      }
      // 'confirm' — the radio's `checked` stays bound to `style`, so the dot does
      // not move until the user actually confirms.
      setPendingStyle(next);
    },
    [style, activePath, resolved, applyStyleSwitch],
  );

  const trimmedName = newBranchName.trim();
  const branchNameField = deriveRefNameField(newBranchName, validateGitBranchName);
  const nameError = branchMode === 'new' ? branchNameField.error : undefined;
  const nameInvalid = branchMode === 'new' && !branchNameField.valid;
  const canConfirm = activePath.trim().length > 0 && !nameInvalid && !busy;

  const commandPreview = useMemo(
    () => buildAddWorktreeCommand({ path: activePath || '<path>', ref: source.ref, branchMode, newBranchName: trimmedName }),
    [activePath, source.ref, branchMode, trimmedName],
  );

  const handleConfirm = useCallback(async () => {
    dialogTelemetry.confirmed();
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    const done = rpcClient.awaitNextDialogAction();
    rpcClient.addWorktree({
      path: activePath.trim(),
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
  }, [canConfirm, activePath, source.ref, branchMode, trimmedName, envCopyEnabled, copyEnvFiles, onClose, dialogTelemetry]);

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
                        className={`${linkButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
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
            {showStyleChoice ? (
              <>
                {WORKTREE_FOLDER_NAME_STYLES.map((option) => {
                  const selected = style === option;
                  return (
                    <div key={option} className="mt-1 flex items-center gap-2">
                      <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2 select-none">
                        <input
                          type="radio"
                          name="worktree-folder-style"
                          checked={selected}
                          onChange={() => handleStyleClick(option)}
                          className="accent-[var(--vscode-button-background)]"
                        />
                        <span className="text-sm text-[var(--vscode-foreground)]">
                          {WORKTREE_STYLE_LABELS[option]}
                        </span>
                      </label>
                      {/* The unselected box stays readable so both concrete paths can
                          be compared, but only the selected one can be edited. */}
                      <input
                        type="text"
                        value={paths[option]}
                        disabled={!selected}
                        onChange={(e) => setActivePath(e.target.value)}
                        aria-label={`${WORKTREE_STYLE_LABELS[option]} worktree folder`}
                        className={`${folderInputClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                      />
                    </div>
                  );
                })}
                {link.visible && (
                  <button
                    type="button"
                    onClick={() => rpcClient.setWorktreeFolderNameStyle(style)}
                    className={`mt-1 ml-1 ${linkButtonClassName}`}
                  >
                    {link.label}
                  </button>
                )}
              </>
            ) : (
              <input
                type="text"
                value={activePath}
                onChange={(e) => setActivePath(e.target.value)}
                className={`mt-1 ${folderInputClassName}`}
              />
            )}
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
              className={buttonSecondaryClassName}
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            {/* Plain button (not AlertDialog.Action) so the dialog stays open on failure. */}
            <button
              type="button"
              disabled={!canConfirm}
              className={buttonPrimaryClassName}
              onClick={handleConfirm}
            >
              {busy ? 'Creating…' : 'Create Worktree'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
      {/* Nested inside the open dialog via its own Portal, so it paints above with
          its own overlay — the same nesting the force-delete flow already uses.
          No telemetryId: this is a preference switch, not a tracked dialog. */}
      <ConfirmDialog
        open={pendingStyle !== null}
        title="Discard changed path?"
        description="Your edited worktree folder will be reset to the default for the option you are switching to."
        confirmLabel="Discard"
        focusConfirm
        onConfirm={() => {
          if (pendingStyle) applyStyleSwitch(pendingStyle);
          setPendingStyle(null);
        }}
        onCancel={() => setPendingStyle(null)}
      />
    </AlertDialog.Root>
  );
}
