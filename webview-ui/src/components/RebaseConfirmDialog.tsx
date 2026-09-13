import { useMemo, useState } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { RebaseEntry } from '@shared/types';
import type { UiSurface } from '@shared/telemetry';
import { buildRebaseCommand } from '../utils/gitCommandBuilder';
import { findAutosquashLinks } from '../utils/autosquash';
import { trackUiInteraction } from '../utils/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { CommandPreview } from './CommandPreview';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogWarningClassName,
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

/** The commits a rebase onto `targetRef` would replay, once per dialog open; `null` while loading. */
type RangeState = { upstream: string; entries: RebaseEntry[] | null } | undefined;

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

  const reset = () => {
    setIgnoreDate(false);
    setAutosquash(false);
    setRange(undefined);
  };

  const handleAutosquashChange = (checked: boolean) => {
    setAutosquash(checked);
    if (!checked || !targetRef) return;
    // Both reads are lazy: the version is needed only to choose the command, and
    // the range only to summarise what autosquash will do.
    rpcClient.requestGitVersion();
    if (range?.upstream === targetRef) return;
    setRange({ upstream: targetRef, entries: null });
    rpcClient.getRebaseRangeCommits(targetRef).then(
      (entries) => setRange((current) => (current?.upstream === targetRef ? { upstream: targetRef, entries } : current)),
      () => {
        // The summary is advisory; the rebase itself still runs. Forget the
        // request, so re-ticking the box (or an unrelated error having
        // rejected it) asks again instead of leaving the summary blank.
        setRange((current) => (current?.upstream === targetRef ? undefined : current));
      },
    );
  };

  const analysis = useMemo(() => {
    const entries = range?.entries;
    if (!entries) return null;
    const { links, unmatched, ambiguousSubjects } = findAutosquashLinks(entries);
    const subjectByHash = new Map(entries.map((entry) => [entry.hash, entry.subject]));
    return {
      appliedCount: links.length,
      unmatchedSubjects: unmatched.map((hash) => subjectByHash.get(hash) ?? hash),
      ambiguousSubjects,
    };
  }, [range]);

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
                {analysis?.appliedCount ?? 0} fixup/squash commit{analysis?.appliedCount === 1 ? '' : 's'} will be applied.
              </p>
              {analysis?.unmatchedSubjects.map((subject) => (
                <p key={`unmatched:${subject}`} className={dialogWarningClassName}>
                  <span className="font-mono">{subject}</span> won&apos;t be applied: its target is not among the
                  rebased commits. Rebase from an earlier commit to include it.
                </p>
              ))}
              {analysis?.ambiguousSubjects.map((subject) => (
                <p key={`ambiguous:${subject}`} className={dialogWarningClassName}>
                  More than one commit matches <span className="font-mono">{subject}</span>. Autosquash matches by
                  subject and may pick the wrong one.
                </p>
              ))}
            </div>
          )}
          {targetRef && (
            <div className="mt-4">
              <CommandPreview
                command={buildRebaseCommand({ targetRef, ignoreDate, autosquash, gitVersion: gitVersion?.version ?? null })}
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
