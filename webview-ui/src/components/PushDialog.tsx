import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { PushForceMode } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';
import { buildPushCommand } from '../utils/gitCommandBuilder';
import { CommandPreview } from './CommandPreview';

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

function getDefaultRemote(remotes: { name: string }[]): string {
  return remotes.find(r => r.name === 'origin')?.name ?? remotes[0]?.name ?? '';
}

export function PushDialog({ open, branchName, onCancel }: PushDialogProps) {
  const remotes = useGraphStore((s) => s.remotes);

  const [setUpstream, setSetUpstream] = useState(true);
  const [forceMode, setForceMode] = useState<PushForceMode>('none');
  const [selectedRemote, setSelectedRemote] = useState(() => getDefaultRemote(remotes));
  const [isPushing, setIsPushing] = useState(false);

  // Reset dialog state each time it opens, syncing selectedRemote with current remotes
  useEffect(() => {
    if (open) {
      setSetUpstream(true);
      setForceMode('none');
      setSelectedRemote(getDefaultRemote(remotes));
      setIsPushing(false);
    }
  }, [open, remotes]);

  const command = buildPushCommand({ remote: selectedRemote, branch: branchName, setUpstream, forceMode });
  const isForce = forceMode !== 'none';
  const noRemotes = remotes.length === 0;

  const handleExecute = async () => {
    setIsPushing(true);
    try {
      await rpcClient.pushAsync(selectedRemote, branchName, setUpstream, forceMode);
    } catch {
      // Error is already shown via store.setError in rpcClient
    } finally {
      setIsPushing(false);
      onCancel();
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !isPushing) {
      onCancel();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50"
          style={{ resize: 'horizontal', overflow: 'auto', width: '45rem', minWidth: '400px', maxWidth: '90vw' }}
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
                ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300'
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
                className="px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleExecute}
              disabled={isPushing || noRemotes}
              className={`px-3 py-1.5 text-sm rounded ${
                isForce
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
              } disabled:opacity-50`}
            >
              {isPushing ? 'Pushing...' : 'Execute'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
