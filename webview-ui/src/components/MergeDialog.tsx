import { useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { MergeOptions } from '@shared/types';
import { buildMergeCommand } from '../utils/gitCommandBuilder';
import { InlineCode } from '../utils/inlineCodeRenderer';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import { CommandPreview } from './CommandPreview';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
} from './dialogStyles';

/**
 * What is being merged in. Git merges all four through the same command, so this
 * only decides the wording — the ref itself is passed through untouched.
 */
export type MergeSourceKind = 'branch' | 'remote-branch' | 'tag' | 'commit';

const TITLE_BY_KIND: Record<MergeSourceKind, string> = {
  branch: 'Merge Branch',
  'remote-branch': 'Merge Remote Branch',
  tag: 'Merge Tag',
  commit: 'Merge Commit',
};

interface MergeDialogProps {
  open: boolean;
  /** The ref git is given — a branch name, `remote/name`, a tag or a commit hash. */
  sourceRef: string;
  /** How the ref is shown to the user; defaults to the ref itself. */
  sourceLabel?: string;
  kind: MergeSourceKind;
  onConfirm: (options: MergeOptions) => void;
  onCancel: () => void;
}

export function MergeDialog({ open, sourceRef, sourceLabel, kind, onConfirm, onCancel }: MergeDialogProps) {
  const label = sourceLabel ?? sourceRef;
  const dialogTelemetry = useDialogTelemetry('merge', open);
  const [squash, setSquash] = useState(false);
  const [noCommit, setNoCommit] = useState(false);
  const [noFastForward, setNoFastForward] = useState(false);

  const handleConfirm = () => {
    dialogTelemetry.confirmed();
    onConfirm({ squash, noCommit, noFastForward: noCommit ? true : noFastForward });
    setSquash(false);
    setNoCommit(false);
    setNoFastForward(false);
  };

  const handleCancel = () => {
    dialogTelemetry.cancelled();
    setSquash(false);
    setNoCommit(false);
    setNoFastForward(false);
    onCancel();
  };

  return (
    <AlertDialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <AlertDialog.Content
          className={dialogContentClassName}
          style={dialogContentStyle}
        >
          <AlertDialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            {TITLE_BY_KIND[kind]}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            Merge &apos;{label}&apos; into the current branch?
          </AlertDialog.Description>

          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={squash}
                onChange={(e) => setSquash(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]"><InlineCode>--squash</InlineCode>: combines all incoming changes into a single change on the current branch without creating a merge commit</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noCommit}
                onChange={(e) => setNoCommit(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]"><InlineCode>--no-commit</InlineCode>: No commits, stage changes only</span>
            </label>

            <label className={`flex items-center gap-2 cursor-pointer select-none ${noCommit ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={noCommit ? true : noFastForward}
                disabled={noCommit}
                onChange={(e) => setNoFastForward(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]"><InlineCode>--no-ff</InlineCode>: Create a new commit even if fast forward is possible</span>
            </label>
          </div>

          <div className="mt-4">
            <CommandPreview command={buildMergeCommand({ ref: sourceRef, squash, noCommit, noFastForward: noCommit ? true : noFastForward })} />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <AlertDialog.Cancel
              className={buttonSecondaryClassName}
              onClick={handleCancel}
            >
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className={buttonPrimaryClassName}
              onClick={handleConfirm}
            >
              Merge
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
