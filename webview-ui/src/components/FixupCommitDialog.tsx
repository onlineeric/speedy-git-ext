import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import type { UiAction, UiSurface } from '@shared/telemetry';
import {
  fixupKindAcceptsAllTracked,
  fixupKindUsesEditorMessage,
  type FixupCommitKind,
} from '@shared/fixupCommit';
import { formatGitFeatureMinimum, formatGitVersion, supportsGitFeature } from '@shared/gitVersion';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { trackUiInteraction } from '../utils/telemetry';
import { buildFixupCommitCommand } from '../utils/gitCommandBuilder';
import { getReachabilityChecker } from '../utils/commitReachability';
import { findHeadCommitHash } from '../utils/commitRefs';
import {
  canConfirmFixup,
  effectiveFixupKind,
  FIXUP_KINDS,
  fixupKindIncludesContent,
  getFixupKindAvailability,
  getInitialFixupSelection,
  squashMessageToSend,
} from '../utils/fixupCommitOptions';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';
import { useCommitHookWait } from '../hooks/useCommitHookWait';
import { useGitVersion } from '../hooks/useGitVersion';
import { CommandPreview } from './CommandPreview';
import { CommitCancelButton, CommitHookWaitNotice } from './CommitHookWait';
import {
  buttonPrimaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogErrorClassName,
  dialogNoteClassName,
  dialogOverlayClassName,
  dialogSectionLabelClassName,
  dialogWarningClassName,
} from './dialogStyles';

interface FixupCommitDialogProps {
  /** The commit the new one targets. */
  commit: Commit;
  /** Menu surface the dialog was opened from, for UI telemetry. */
  surface: UiSurface;
  onClose: () => void;
}

const KIND_LABELS: Record<FixupCommitKind, { label: string; description: string }> = {
  fixup: { label: 'Fixup', description: 'add changes; the target keeps its message' },
  squash: { label: 'Squash', description: 'add changes; messages are combined' },
  amend: { label: 'Amend', description: "add changes and replace the target's message" },
  reword: { label: 'Reword', description: "replace the target's message only" },
};

const KIND_TELEMETRY: Record<FixupCommitKind, UiAction> = {
  fixup: 'fixupKindFixup',
  squash: 'fixupKindSquash',
  amend: 'fixupKindAmend',
  reword: 'fixupKindReword',
};

const textareaClassName =
  'w-full resize-y rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] p-2 font-mono text-sm text-[var(--vscode-input-foreground)] disabled:opacity-60';

/**
 * Stacks alternatives in one grid cell and shows only the active one, so the
 * cell is always as tall as the tallest and switching kind never moves the
 * dialog. Hidden alternatives are `invisible`, which also takes them out of the
 * tab order.
 */
function StableSlot({ active, children }: { active: string; children: Array<{ key: string; node: ReactNode }> }) {
  return (
    <div className="grid">
      {children.map(({ key, node }) => (
        <div key={key} className={`[grid-area:1/1] ${key === active ? '' : 'invisible'}`} aria-hidden={key !== active}>
          {node}
        </div>
      ))}
    </div>
  );
}

/**
 * Create Fixup Commit. Mounted only while open, so every open starts from the
 * initial state below.
 */
export function FixupCommitDialog({ commit, surface, onClose }: FixupCommitDialogProps) {
  const dialogTelemetry = useDialogTelemetry('createFixupCommit', true);
  const hookWait = useCommitHookWait();

  const counts = useGraphStore((s) => s.uncommittedCounts);
  const commits = useGraphStore((s) => s.commits);
  const gitVersion = useGitVersion();
  const knownVersion = gitVersion?.version ?? null;
  const supportsAmendReword = supportsGitFeature(knownVersion, 'fixupAmendReword');

  const [initial] = useState(() => getInitialFixupSelection({ counts, supportsAmendReword }));
  const [selectedKind, setSelectedKind] = useState<FixupCommitKind | null>(initial.kind);
  const [includeAllTracked, setIncludeAllTracked] = useState(initial.includeAllTracked);
  const [squashAddMessage, setSquashAddMessage] = useState(false);
  const [squashText, setSquashText] = useState('');
  // `null` until the target's message arrives — the one state that means "not loaded".
  const [replacementMessage, setReplacementMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpcClient.getCommitMessage(commit.hash).then(
      (message) => {
        if (!cancelled) setReplacementMessage(message);
      },
      () => {
        // Fall back to the subject rather than an empty box, as the amend dialog does.
        if (!cancelled) setReplacementMessage(commit.subject);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [commit.hash, commit.subject]);

  // Autosquash on this branch only reaches ancestors of HEAD. Unknown (HEAD not
  // loaded) says nothing rather than warning on a guess.
  const isAncestorOfHead = useMemo(() => {
    const headHash = findHeadCommitHash(commits);
    return headHash === null || getReachabilityChecker(commits).isReachableFromHead(commit.hash, headHash);
  }, [commits, commit.hash]);

  const availability = getFixupKindAvailability({ counts, includeAllTracked, supportsAmendReword });
  const kind = effectiveFixupKind(selectedKind, availability);
  const isRunning = hookWait.isRunning;
  const confirmDisabled = isRunning || !canConfirmFixup({ kind, availability, replacementMessage });

  const includeDisabled = isRunning || kind === 'reword';
  const squashMessage = squashMessageToSend(squashAddMessage, squashText);
  const previewKind = kind ?? 'fixup';
  const command = buildFixupCommitCommand({
    kind: previewKind,
    targetHash: commit.hash,
    includeAllTracked,
    hasMessage: squashMessage !== undefined,
  });

  const handleConfirm = async () => {
    if (kind === null) return;
    const sendsAllTracked = includeAllTracked && fixupKindAcceptsAllTracked(kind);

    dialogTelemetry.confirmed();
    trackUiInteraction(surface, KIND_TELEMETRY[kind]);
    if (sendsAllTracked) trackUiInteraction(surface, 'fixupIncludeAllTracked');
    if (kind === 'squash' && squashMessage !== undefined) trackUiInteraction(surface, 'fixupSquashMessage');

    setError(null);
    hookWait.start();
    try {
      await rpcClient.createFixupCommit({
        kind,
        targetHash: commit.hash,
        includeAllTracked: sendsAllTracked,
        message: fixupKindUsesEditorMessage(kind) ? (replacementMessage ?? '') : kind === 'squash' ? squashMessage : undefined,
      });
    } catch (createError) {
      // Every failure keeps the dialog open with what was typed — a `commit-msg`
      // hook that rejects at second 40 must not take the message with it.
      setError(String(createError));
      hookWait.finish();
      return;
    }
    hookWait.finish();
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen || isRunning) return;
    dialogTelemetry.cancelled();
    onClose();
  };

  const stagedLabel = `${counts.stagedCount} file${counts.stagedCount === 1 ? '' : 's'}`;
  // Shown only where some include option can cover nothing, so the note's space
  // is reserved exactly when toggling could make it appear.
  const nothingToCommitPossible = counts.stagedCount === 0;
  const nothingToCommitShown = kind !== null && availability[kind] === 'nothingToCommit';
  const untrackedShown = counts.untrackedCount > 0 && (kind === null || fixupKindIncludesContent(kind));

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClassName} />
        <Dialog.Content className={dialogContentClassName} style={dialogContentStyle}>
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Create Fixup Commit
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-[var(--vscode-descriptionForeground)]">
            Creates a new commit on HEAD that targets{' '}
            <code className="font-mono">{commit.abbreviatedHash}</code>{' '}
            <span className="text-[var(--vscode-foreground)]">{commit.subject}</span>. Autosquash applies it
            to the target when you rebase.
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            {!isAncestorOfHead && (
              <p className={dialogWarningClassName}>
                This commit is not an ancestor of HEAD, so autosquash on the current branch will never
                apply the new commit.
              </p>
            )}

            <fieldset className="space-y-1" disabled={isRunning}>
              <legend className={dialogSectionLabelClassName}>Kind</legend>
              {FIXUP_KINDS.map((option) => (
                <label
                  key={option}
                  className={`flex items-start gap-2 ${availability[option] === 'gitTooOld' ? 'opacity-60' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="fixupKind"
                    value={option}
                    checked={kind === option}
                    disabled={availability[option] === 'gitTooOld'}
                    onChange={() => setSelectedKind(option)}
                    className="mt-0.5 cursor-pointer"
                  />
                  <span className="text-sm text-[var(--vscode-foreground)]">
                    {KIND_LABELS[option].label}{' '}
                    <span className="text-[var(--vscode-descriptionForeground)]">— {KIND_LABELS[option].description}</span>
                  </span>
                </label>
              ))}
              {!supportsAmendReword && knownVersion && (
                <p className="text-xs text-[var(--vscode-descriptionForeground)]">
                  Amend and Reword require git {formatGitFeatureMinimum('fixupAmendReword')}+ — you
                  have {formatGitVersion(knownVersion)}.
                </p>
              )}
            </fieldset>

            <fieldset className={`space-y-1 ${kind === 'reword' ? 'opacity-60' : ''}`} disabled={includeDisabled}>
              <legend className={dialogSectionLabelClassName}>Include</legend>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="fixupInclude"
                  checked={!includeAllTracked}
                  onChange={() => setIncludeAllTracked(false)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">Staged changes only ({stagedLabel})</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="fixupInclude"
                  checked={includeAllTracked}
                  onChange={() => setIncludeAllTracked(true)}
                  className="mt-0.5 cursor-pointer"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  All tracked changes, <code className="font-mono">-a</code> ({counts.stagedCount} staged +{' '}
                  {counts.unstagedCount} modified)
                </span>
              </label>
            </fieldset>

            <StableSlot active={kind === null ? 'fixup' : fixupKindUsesEditorMessage(kind) ? 'replace' : kind}>
              {[
                {
                  key: 'fixup',
                  node: (
                    <p className="text-sm text-[var(--vscode-descriptionForeground)]">
                      No message needed: a fixup commit&apos;s message is discarded when it is squashed, and the
                      target keeps its own.
                    </p>
                  ),
                },
                {
                  key: 'squash',
                  node: (
                    <div className="space-y-1">
                      <label className="flex cursor-pointer select-none items-center gap-2">
                        <input
                          type="checkbox"
                          checked={squashAddMessage}
                          onChange={(e) => setSquashAddMessage(e.target.checked)}
                          disabled={isRunning || kind !== 'squash'}
                          className="h-4 w-4 accent-[var(--vscode-button-background)]"
                        />
                        <span className="text-sm text-[var(--vscode-foreground)]">
                          Add a message <code className="font-mono">-m</code>
                        </span>
                      </label>
                      <textarea
                        value={squashText}
                        onChange={(e) => setSquashText(e.target.value)}
                        disabled={isRunning || kind !== 'squash' || !squashAddMessage}
                        rows={5}
                        placeholder="Added below the combined message…"
                        aria-label="Squash message"
                        className={textareaClassName}
                      />
                    </div>
                  ),
                },
                {
                  key: 'replace',
                  node: (
                    <div className="space-y-1">
                      <label htmlFor="fixup-replacement-message" className="text-sm text-[var(--vscode-foreground)]">
                        New message for the target:
                      </label>
                      <textarea
                        id="fixup-replacement-message"
                        value={replacementMessage ?? ''}
                        onChange={(e) => setReplacementMessage(e.target.value)}
                        disabled={isRunning || replacementMessage === null || kind === null || !fixupKindUsesEditorMessage(kind)}
                        rows={5}
                        placeholder={replacementMessage === null ? 'Loading commit message…' : 'Commit message…'}
                        className={textareaClassName}
                      />
                    </div>
                  ),
                },
              ]}
            </StableSlot>

            {counts.untrackedCount > 0 && (
              <p className={`${dialogWarningClassName} ${untrackedShown ? '' : 'invisible'}`} aria-hidden={!untrackedShown}>
                {counts.untrackedCount} untracked file{counts.untrackedCount === 1 ? ' is' : 's are'} not included, not
                even by <code className="font-mono">-a</code>. Add them first (<code className="font-mono">git add</code>)
                if they belong in this commit.
              </p>
            )}

            {nothingToCommitPossible && (
              <p
                className={`${dialogNoteClassName} ${nothingToCommitShown ? '' : 'invisible'}`}
                aria-hidden={!nothingToCommitShown}
              >
                Nothing to commit with this option, so Fixup and Squash cannot be created. Amend and Reword
                do not need changes.
              </p>
            )}

            <div className={kind === null ? 'invisible' : ''} aria-hidden={kind === null}>
              <CommandPreview command={command} />
              <p
                className={`mt-1 text-xs text-[var(--vscode-descriptionForeground)] ${
                  fixupKindUsesEditorMessage(previewKind) ? '' : 'invisible'
                }`}
              >
                The message is supplied when git opens its editor; the <code className="font-mono">amend!</code>{' '}
                title line git writes is kept.
              </p>
            </div>

            <CommitHookWaitNotice phase={hookWait.phase} />

            {error && <p className={dialogErrorClassName}>{error}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <CommitCancelButton
              phase={hookWait.phase}
              onCancelWait={() => rpcClient.cancelFixupCommit()}
              onCancel={() => handleOpenChange(false)}
            />
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              className={buttonPrimaryClassName}
            >
              {isRunning ? 'Creating…' : 'Create Commit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
