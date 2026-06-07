import { useState, useMemo, useCallback } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { WorktreeInfo } from '@shared/types';
import { buildRemoveWorktreeCommand, buildDeleteBranchCommand } from '../utils/gitCommandBuilder';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { worktreeLocalBranch } from '../utils/worktreeDisplay';
import { CommandPreview } from './CommandPreview';
import { dialogContentClassName, dialogContentStyle } from './dialogStyles';

interface RemoveWorktreeDialogProps {
  open: boolean;
  worktree: WorktreeInfo;
  onClose: () => void;
}

type BranchDeleteOutcome = 'ok' | 'needs-force' | { error: string };

/**
 * Drive a single `deleteBranch` attempt and resolve its outcome. The backend
 * answers an un-forced not-fully-merged delete with a `deleteBranchNeedsForce`
 * response (which sets `pendingForceDeleteBranch`) rather than an `error`, so we
 * race the success/error promise against that store signal and consume it here
 * to avoid the global force-delete dialog also reacting.
 */
function runBranchDelete(name: string, force: boolean): Promise<BranchDeleteOutcome> {
  const done = rpcClient.awaitNextDialogAction();

  let unsub: (() => void) | undefined;
  const needsForce = new Promise<'needs-force'>((resolve) => {
    unsub = useGraphStore.subscribe((state) => {
      if (state.pendingForceDeleteBranch && state.pendingForceDeleteBranch.name === name) {
        useGraphStore.getState().setPendingForceDeleteBranch(null);
        resolve('needs-force');
      }
    });
  });

  rpcClient.deleteBranch(name, force);

  return Promise.race<BranchDeleteOutcome>([
    done.then<BranchDeleteOutcome>(() => 'ok').catch((e): BranchDeleteOutcome => {
      if (e === 'superseded' || e === 'dialog-closed') return { error: 'Branch deletion was interrupted.' };
      return { error: typeof e === 'string' ? e : (e as Error).message };
    }),
    needsForce.then((v) => {
      // Stop awaiting the (now irrelevant) success/error slot for the failed safe delete.
      rpcClient.clearPendingDialogAction();
      return v;
    }),
    // Always tear down the store subscription once the race settles, regardless
    // of which branch wins — otherwise a `done`-first outcome leaves the
    // subscriber alive to later consume an unrelated `pendingForceDeleteBranch`.
  ]).finally(() => unsub?.());
}

export function RemoveWorktreeDialog({ open, worktree, onClose }: RemoveWorktreeDialogProps) {
  const name = worktreeLocalBranch(worktree);
  const [force, setForce] = useState(false);
  const [alsoDeleteBranch, setAlsoDeleteBranch] = useState(false);
  const [forceDeleteBranch, setForceDeleteBranch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the worktree itself is removed, only the branch deletion can be retried.
  const [worktreeRemoved, setWorktreeRemoved] = useState(false);
  // Mounted only while a target is selected (see WorktreeWidget), so the initial
  // useState values above seed fresh state per open — no reset effect needed.

  const commandPreview = useMemo(() => {
    if (worktreeRemoved && name) {
      return buildDeleteBranchCommand({ name, force: forceDeleteBranch });
    }
    let cmd = buildRemoveWorktreeCommand({ path: worktree.path, force });
    if (alsoDeleteBranch && name) {
      cmd += ` && ${buildDeleteBranchCommand({ name, force: forceDeleteBranch })}`;
    }
    return cmd;
  }, [worktreeRemoved, name, force, alsoDeleteBranch, forceDeleteBranch, worktree.path]);

  const deleteBranchStep = useCallback(async (): Promise<boolean> => {
    if (!name) return true;
    const outcome = await runBranchDelete(name, forceDeleteBranch);
    if (outcome === 'ok') return true;
    if (outcome === 'needs-force') {
      // Surface the failure but leave force-delete unchecked: the user must
      // explicitly opt in to discarding unmerged commits before retrying.
      setError(`Branch "${name}" is not fully merged. Enable "force delete" to remove it anyway.`);
      return false;
    }
    setError(outcome.error);
    return false;
  }, [name, forceDeleteBranch]);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    setError(null);

    // Retry path: the worktree is already gone, only branch deletion remains.
    if (worktreeRemoved) {
      const ok = await deleteBranchStep();
      if (ok) onClose();
      else setBusy(false);
      return;
    }

    const done = rpcClient.awaitNextDialogAction();
    rpcClient.removeWorktree(worktree.path, force);
    try {
      await done;
    } catch (e) {
      if (e === 'superseded' || e === 'dialog-closed') return;
      setError(typeof e === 'string' ? e : (e as Error).message);
      setBusy(false);
      return;
    }

    setWorktreeRemoved(true);

    if (alsoDeleteBranch && name) {
      const ok = await deleteBranchStep();
      if (ok) onClose();
      else setBusy(false);
      return;
    }

    onClose();
  }, [worktreeRemoved, deleteBranchStep, worktree.path, force, alsoDeleteBranch, name, onClose]);

  const handleCancel = useCallback(() => {
    rpcClient.clearPendingDialogAction();
    onClose();
  }, [onClose]);

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            {worktreeRemoved ? 'Delete Branch' : 'Remove Worktree'}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)] break-all">
            {worktreeRemoved
              ? `The worktree was removed. Finish deleting branch "${name}"?`
              : worktree.path}
          </AlertDialog.Description>

          {!worktreeRemoved && (
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={force}
                  onChange={(e) => setForce(e.target.checked)}
                  className="mt-0.5 accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Force remove (required if the worktree has uncommitted changes — those changes will be lost)
                </span>
              </label>

              {name && (
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alsoDeleteBranch}
                    onChange={(e) => setAlsoDeleteBranch(e.target.checked)}
                    className="mt-0.5 accent-[var(--vscode-button-background)]"
                  />
                  <span className="text-sm text-[var(--vscode-foreground)]">
                    Also delete branch <span className="font-mono">{name}</span>
                  </span>
                </label>
              )}
            </div>
          )}

          {(alsoDeleteBranch || worktreeRemoved) && name && (
            <label className="mt-3 flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceDeleteBranch}
                onChange={(e) => setForceDeleteBranch(e.target.checked)}
                className="mt-0.5 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">
                Force delete branch (discard unmerged commits)
              </span>
            </label>
          )}

          <p className="mt-3 text-xs text-[var(--vscode-descriptionForeground)]">
            If this worktree is open in another window, that window will be left pointing at a deleted folder.
          </p>

          <div className="mt-4">
            <CommandPreview command={commandPreview} />
          </div>

          {error && <p className="mt-3 text-sm text-[var(--vscode-errorForeground)]">{error}</p>}

          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              onClick={handleCancel}
            >
              {worktreeRemoved ? 'Close' : 'Cancel'}
            </AlertDialog.Cancel>
            {/* Plain button so the dialog stays open on failure / retry. */}
            <button
              type="button"
              disabled={busy}
              className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-errorForeground)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleConfirm}
            >
              {busy ? 'Working…' : worktreeRemoved ? 'Delete Branch' : 'Remove'}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
