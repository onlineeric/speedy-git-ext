import { useEffect, useMemo, useRef, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { RebaseRangeCommit } from '@shared/types';
import type { UiSurface } from '@shared/telemetry';
import { buildRebaseCommand } from '../utils/gitCommandBuilder';
import { findAutosquashLinks, isAutosquashDefaultChecked } from '../utils/autosquash';
import { trackUiInteraction } from '../utils/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { AutosquashWarnings } from './AutosquashWarnings';
import { CommandPreview } from './CommandPreview';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

export interface RebaseConfirmOptions {
  ignoreDate: boolean;
  autosquash: boolean;
}

interface RebaseConfirmDialogProps {
  open: boolean;
  onConfirm: (options: RebaseConfirmOptions) => void;
  onCancel: () => void;
  title: string;
  description: string;
  targetRef?: string;
  /** Menu surface the dialog was opened from, for UI telemetry. */
  surface: UiSurface;
}

/** The commits a rebase onto `targetRef` would replay, read once per dialog open; `undefined` until it lands. */
type RangeState = { upstream: string; commits: RebaseRangeCommit[] } | undefined;

export function RebaseConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  targetRef,
  surface,
}: RebaseConfirmDialogProps) {
  const dialogTelemetry = useDialogTelemetry('rebase', open);
  const [ignoreDate, setIgnoreDate] = useState(false);
  const [autosquash, setAutosquash] = useState(false);
  const [range, setRange] = useState<RangeState>(undefined);
  const gitVersion = useGraphStore((s) => s.gitVersion);

  /**
   * Set once the user ticks or unticks Autosquash, so a range read that lands
   * afterwards does not overwrite their choice with the computed default.
   */
  const autosquashTouchedRef = useRef(false);

  const reset = () => {
    setIgnoreDate(false);
    setAutosquash(false);
    setRange(undefined);
    autosquashTouchedRef.current = false;
  };

  // The range is read as the dialog opens, because Autosquash's default depends on
  // it: ticked exactly when a fixup/squash commit in the range will be applied.
  useEffect(() => {
    if (!open || !targetRef) return;
    let cancelled = false;
    rpcClient.getRebaseRangeCommits(targetRef).then(
      (commits) => {
        if (cancelled) return;
        setRange({ upstream: targetRef, commits });
        if (autosquashTouchedRef.current) return;
        const checked = isAutosquashDefaultChecked(findAutosquashLinks(commits));
        setAutosquash(checked);
        // Only needed to choose the command, so only once autosquash is in it.
        if (checked) rpcClient.requestGitVersion();
      },
      () => {
        // The summary is advisory and the rebase still runs; Autosquash simply
        // stays unticked, which is what it does with nothing to apply.
        if (!cancelled) setRange(undefined);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, targetRef]);

  const handleAutosquashChange = (checked: boolean) => {
    autosquashTouchedRef.current = true;
    setAutosquash(checked);
    if (checked) rpcClient.requestGitVersion();
  };

  // Keyed by upstream so a read for an earlier target never describes this one.
  const rangeCommits = range && range.upstream === targetRef ? range.commits : null;
  const analysis = useMemo(() => (rangeCommits ? findAutosquashLinks(rangeCommits) : null), [rangeCommits]);
  const appliedCount = analysis?.links.length ?? 0;

  const handleConfirm = () => {
    dialogTelemetry.confirmed();
    if (autosquash) trackUiInteraction(surface, 'rebaseAutosquash');
    onConfirm({ ignoreDate, autosquash });
    reset();
  };

  const handleCancel = () => {
    dialogTelemetry.cancelled();
    reset();
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
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--vscode-descriptionForeground)]">
            {description}
          </AlertDialog.Description>
          <label className="flex items-center gap-2 mt-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={ignoreDate}
              onChange={(e) => setIgnoreDate(e.target.checked)}
              className="w-4 h-4 accent-[var(--vscode-button-background)]"
            />
            <span className="text-sm text-[var(--vscode-foreground)]">Ignore Date</span>
            <span
              className="text-xs text-[var(--vscode-descriptionForeground)]"
              title="Rebased commits will use the current timestamp instead of preserving the original commit dates."
            >
              (use current timestamp for rebased commits)
            </span>
          </label>
          {targetRef && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autosquash}
                onChange={(e) => handleAutosquashChange(e.target.checked)}
                className="w-4 h-4 accent-[var(--vscode-button-background)]"
              />
              <span className="text-sm text-[var(--vscode-foreground)]">Autosquash fixup/squash commits</span>
              <span
                className="text-xs text-[var(--vscode-descriptionForeground)]"
                title="Folds fixup!, squash! and amend! commits into the commits they target, keeping git's prepared messages. To edit a combined message, use the interactive rebase."
              >
                (apply fixup!/squash!/amend! commits)
              </span>
            </label>
          )}
          {autosquash && (
            <div className="mt-3 space-y-2">
              {/* The line is always rendered once ticked, so the count arriving
                  does not move anything below it. */}
              <p
                className={`text-sm text-[var(--vscode-foreground)] ${analysis ? '' : 'invisible'}`}
                aria-hidden={!analysis}
              >
                {appliedCount} fixup/squash commit{appliedCount === 1 ? '' : 's'} will be applied.
              </p>
              {rangeCommits && analysis && <AutosquashWarnings entries={rangeCommits} analysis={analysis} />}
            </div>
          )}
          {targetRef && (
            <div className="mt-4">
              <CommandPreview
                command={buildRebaseCommand({ targetRef, ignoreDate, autosquash, gitVersion: gitVersion ?? null })}
              />
            </div>
          )}
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
              Rebase
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
