import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Branch, PushForceMode } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { buildPushCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';
import {
  buttonDangerClassName,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import { expectRemoteBranch } from '../utils/refExpectation';
import { resolveDefaultRemoteName } from '../utils/resolveDefaultRemote';

interface PushDialogProps {
  open: boolean;
  branchName: string;
  onCancel: () => void;
}

const PUSH_MODE_OPTIONS = [
  { value: 'none', label: 'Normal' },
  { value: 'force-with-lease', label: '--force-with-lease' },
  { value: 'force', label: '--force' },
] as const;

export function PushDialog({ open, branchName, onCancel }: PushDialogProps) {
  const dialogTelemetry = useDialogTelemetry('push', open);
  const remotes = useGraphStore((s) => s.remotes);

  const [setUpstream, setSetUpstream] = useState(true);
  const [forceMode, setForceMode] = useState<PushForceMode>('none');
  const [selectedRemote, setSelectedRemote] = useState(() => resolveDefaultRemoteName(remotes));
  const [isPushing, setIsPushing] = useState(false);
  /**
   * The branch list as it stood when the dialog opened.
   *
   * A force-push is checked against where the destination's remote-tracking ref
   * was *then*, not where an auto-refresh has since moved it — and the user may
   * still change which remote they are pushing to, so the snapshot is kept
   * whole and the expectation built from it at confirm.
   */
  const branchesAtOpen = useRef<Branch[]>([]);

  // Reset dialog state once per opening. Keyed on `open` ALONE: the tab
  // auto-refreshes while the dialog sits open and hands the store a fresh
  // `remotes` array each time, so depending on it would re-run this — throwing
  // away the user's force selection and, worse, re-snapshotting `branchesAtOpen`
  // to the position the stale-ref check exists to catch.
  useEffect(() => {
    if (!open) return;
    const store = useGraphStore.getState();
    setSetUpstream(true);
    setForceMode('none');
    setSelectedRemote(resolveDefaultRemoteName(store.remotes));
    setIsPushing(false);
    branchesAtOpen.current = store.branches;
  }, [open]);

  // Remotes may still be loading when the dialog opens, so heal a selection that
  // names no existing remote — without touching one the user made.
  useEffect(() => {
    if (!open) return;
    setSelectedRemote((current) =>
      remotes.some((remote) => remote.name === current) ? current : resolveDefaultRemoteName(remotes));
  }, [open, remotes]);

  const command = buildPushCommand({ remote: selectedRemote, branch: branchName, setUpstream, forceMode });
  const isForce = forceMode !== 'none';
  const noRemotes = remotes.length === 0;

  const handleExecute = async () => {
    dialogTelemetry.confirmed();
    setIsPushing(true);
    try {
      // Only a force push needs the check: git already refuses a normal push
      // whose remote moved.
      await rpcClient.pushAsync(
        selectedRemote,
        branchName,
        setUpstream,
        forceMode,
        isForce ? expectRemoteBranch(branchesAtOpen.current, selectedRemote, branchName) : undefined,
      );
    } catch {
      // Error is already shown via store.setError in rpcClient
    } finally {
      setIsPushing(false);
      onCancel();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isPushing) {
      dialogTelemetry.cancelled();
      onCancel();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Push Branch: <code className="font-mono">{branchName}</code>
          </Dialog.Title>

          <div className="mt-4 space-y-4">
            {/* Remote selector */}
            <div className="space-y-1">
              <label className="text-sm text-[var(--vscode-foreground)]">Remote:</label>
              <select
                value={selectedRemote}
                onChange={(e) => setSelectedRemote(e.target.value)}
                disabled={isPushing || noRemotes}
                className="w-full px-2 py-1 text-sm rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)]"
              >
                {noRemotes ? (
                  <option value="">No remotes configured</option>
                ) : (
                  remotes.map((r) => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))
                )}
              </select>
            </div>

            {/* Set upstream checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={setUpstream}
                onChange={(e) => setSetUpstream(e.target.checked)}
                disabled={isPushing}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)] font-mono">--set-upstream / -u</span>
            </label>

            {/* Push mode radio group */}
            <fieldset disabled={isPushing} className="space-y-2">
              <legend className="text-sm text-[var(--vscode-foreground)]">Push mode:</legend>
              <div className="space-y-1 ml-1">
                {PUSH_MODE_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="pushMode"
                      value={option.value}
                      checked={forceMode === option.value}
                      onChange={() => setForceMode(option.value)}
                      className="w-4 h-4 accent-[var(--vscode-button-background)]"
                    />
                    <span className={`text-sm ${option.value === 'none' ? 'text-[var(--vscode-foreground)]' : 'text-[var(--vscode-foreground)] font-mono'}`}>
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Always rendered to reserve fixed height — prevents dialog from resizing when toggling push mode */}
            <div className={`px-3 py-2 rounded border text-sm ${
              isForce
                ? 'border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-inputValidation-warningForeground,var(--vscode-foreground))]'
                : 'border-transparent text-transparent select-none'
            }`}>
              Warning: Force pushing will overwrite remote history. This can cause data loss for other collaborators.
            </div>

            {/* Command preview */}
            <CommandPreview command={command} />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4">
            <Dialog.Close asChild>
              <button
                type="button"
                disabled={isPushing}
                className={buttonSecondaryClassName}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPushing || noRemotes}
              className={isForce ? buttonDangerClassName : buttonPrimaryClassName}
            >
              {isPushing ? 'Pushing...' : 'Execute'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
