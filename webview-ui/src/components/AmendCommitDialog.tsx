import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { Commit } from '@shared/types';
import type { UiSurface } from '@shared/telemetry';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { useCurrentLocalBranch } from '../stores/graphSelectors';
import { trackUiInteraction } from '../utils/telemetry';
import { describeForcePushFailure } from '../utils/amendMessages';
import { hasRemoteCounterpart } from '../utils/commitMenuAvailability';
import { buildAmendCommand, buildPushCommand } from '../utils/gitCommandBuilder';
import { resolveDefaultRemote } from '../utils/resolveDefaultRemote';
import { CommandPreview } from './CommandPreview';
import {
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  dialogContentClassName,
  dialogContentStyle,
  dialogErrorClassName,
  dialogNoteClassName,
  dialogOverlayClassName,
  dialogWarningClassName,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface AmendCommitDialogProps {
  commit: Commit;
  /** Menu surface the dialog was opened from, for UI telemetry. */
  surface: UiSurface;
  onClose: () => void;
}

/**
 * How long an amend may run before the dialog stops looking merely slow.
 *
 * Committing runs `pre-commit` and `commit-msg` hooks — git runs them even for a
 * message-only amend — and hook output is invisible from here. In a husky /
 * lint-staged repo that is tens of seconds of apparent nothing, so past this
 * point the wait is named as the repo's own tooling and given a way out. Fast
 * repos finish long before and never see it.
 */
const HOOK_WAIT_NOTICE_MS = 3_000;

/**
 * Idle, running, and running long enough to name the hooks. One value rather
 * than two booleans: the fourth combination they could spell (waiting on hooks
 * while not amending) does not exist, and every exit has to clear both.
 */
type AmendPhase = 'idle' | 'amending' | 'waitingOnHooks';

/**
 * The dialog is mounted only while it is open (the menu renders it
 * conditionally), so there is no closed state to model here: every open starts
 * from the initial state below, and `Dialog.Root` is opened unconditionally.
 */
export function AmendCommitDialog({ commit, surface, onClose }: AmendCommitDialogProps) {
  const dialogTelemetry = useDialogTelemetry('amendCommit', true);

  // `null` until the message arrives — the one state that means "not loaded".
  const [message, setMessage] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [includeStaged, setIncludeStaged] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [phase, setPhase] = useState<AmendPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const hookNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

  const stagedCount = useGraphStore((s) => s.uncommittedCounts.stagedCount);
  // Presence, not verification: the note only needs to know the commit *is*
  // signed, and the Signature column already answers that from the store.
  // `getSignatureInfo` would run `%G?` plus `cat-file` and can spawn gpg — the
  // one input here slow enough to hold up a dialog that is meant to open at once.
  const isSigned = useGraphStore((s) => s.signaturePresence[commit.hash] === 'signed');
  const branches = useGraphStore((s) => s.branches);
  const currentLocalBranch = useCurrentLocalBranch();

  // The dialog renders immediately and fills in as answers arrive; each input
  // tolerates failure by leaving its element out rather than blocking the rest.
  useEffect(() => {
    let cancelled = false;

    rpcClient.getCommitMessage(commit.hash).then(
      (fullMessage) => {
        if (!cancelled) setMessage(fullMessage);
      },
      () => {
        // Fall back to the subject rather than an empty box: the user can still
        // amend, and an empty prefill would invite confirming away the message.
        if (!cancelled) setMessage(commit.subject);
      },
    );

    rpcClient.isCommitPushed(commit.hash).then(
      (pushed) => {
        if (!cancelled) setIsPublished(pushed);
      },
      () => {
        // Unknown: show neither the warning nor the force-push option.
      },
    );

    return () => {
      cancelled = true;
    };
  }, [commit.hash, commit.subject]);

  useEffect(() => () => clearTimeout(hookNoticeTimer.current), []);

  const isAmending = phase !== 'idle';

  // Two separate questions, and they come apart: `isPublished` says the *commit*
  // is on a remote, which stays true when an unpublished branch merely shares a
  // tip with a published one. Offering a force push there would publish the
  // current branch for the first time — under a label that says force push, on a
  // branch whose absence of a remote is precisely what makes it private. So the
  // affordance needs both: the commit is out there, and this branch is too.
  const canForcePush = isPublished && hasRemoteCounterpart(branches, currentLocalBranch?.name);
  const confirmDisabled = message === null || message.trim().length === 0 || isAmending;

  // One description of the push, so the previewed command and the push that runs
  // cannot describe different things.
  const pushTarget =
    canForcePush && forcePush && currentLocalBranch
      ? {
          remote: resolveDefaultRemote(branches),
          branch: currentLocalBranch.name,
          setUpstream: false,
          forceMode: 'force-with-lease' as const,
        }
      : null;

  const handleConfirm = async () => {
    dialogTelemetry.confirmed();
    if (includeStaged) trackUiInteraction(surface, 'amendIncludeStaged');
    if (pushTarget) trackUiInteraction(surface, 'amendForcePush');

    setError(null);
    setPhase('amending');
    hookNoticeTimer.current = setTimeout(() => setPhase('waitingOnHooks'), HOOK_WAIT_NOTICE_MS);

    try {
      await rpcClient.amendCommit(message ?? '', includeStaged, commit.hash);
    } catch (amendError) {
      // Every failure keeps the dialog open with the typed message intact — a
      // `commit-msg` hook that rejects at second 40 must not take the message
      // with it. Only success and the user's own cancel close it.
      setError(String(amendError));
      setPhase('idle');
      clearTimeout(hookNoticeTimer.current);
      return;
    }
    clearTimeout(hookNoticeTimer.current);

    // The amend rewrote the tip, so its hash changed and the selection would
    // otherwise be dropped by the reload that follows.
    rpcClient.selectHeadAfterNextLoad();
    onClose();

    if (pushTarget) {
      try {
        await rpcClient.pushAsync(
          pushTarget.remote,
          pushTarget.branch,
          pushTarget.setUpstream,
          pushTarget.forceMode,
        );
      } catch (pushError) {
        const raw = pushError instanceof Error ? pushError.message : String(pushError);
        useGraphStore.getState().setError(describeForcePushFailure(raw));
      }
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen || isAmending) return;
    dialogTelemetry.cancelled();
    onClose();
  };

  return (
    <Dialog.Root open onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClassName} />
        <Dialog.Content className={dialogContentClassName} style={dialogContentStyle}>
          <Dialog.Title className="text-base font-semibold text-[var(--vscode-foreground)]">
            Amend Last Commit
          </Dialog.Title>
          {/* Names the branch that moves, because the menu item does not: amend is
             offered from every badge on this row, and a badge for some *other*
             branch sitting on the same tip would otherwise leave which ref
             follows the rewrite to be inferred. Nothing is named in detached
             HEAD, where only HEAD moves. */}
          <Dialog.Description className="mt-1 text-sm text-[var(--vscode-descriptionForeground)]">
            Rewrites <code className="font-mono">{commit.abbreviatedHash}</code>, the commit currently checked out.
            {currentLocalBranch && (
              <> <code className="font-mono">{currentLocalBranch.name}</code> will move to the amended commit.</>
            )}
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label htmlFor="amend-message" className="text-sm text-[var(--vscode-foreground)]">
                Commit message:
              </label>
              <textarea
                id="amend-message"
                value={message ?? ''}
                onChange={(e) => setMessage(e.target.value)}
                disabled={message === null || isAmending}
                rows={8}
                placeholder={message === null ? 'Loading commit message…' : 'Commit message…'}
                className="w-full resize-y rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] p-2 font-mono text-sm text-[var(--vscode-input-foreground)] disabled:opacity-60"
              />
            </div>

            {stagedCount > 0 && (
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeStaged}
                  onChange={(e) => setIncludeStaged(e.target.checked)}
                  disabled={isAmending}
                  className="h-4 w-4 accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">
                  Include {stagedCount} staged file{stagedCount === 1 ? '' : 's'} in this commit
                </span>
              </label>
            )}

            {/* Gated on the same question as the checkbox below. When the commit is
               published only through some *other* branch's remote, this branch's
               amend rewrites nothing that is out there — the published copy is
               left untouched on its own ref — so "you will need to force push"
               would simply be untrue. */}
            {canForcePush && (
              <p className={dialogWarningClassName}>
                This commit already exists on a remote. Amending rewrites it, so the remote and your
                branch will disagree until you force push.
              </p>
            )}

            {isSigned && (
              <p className={dialogNoteClassName}>
                This commit is signed. Amending replaces the signature — re-signed with your own key
                if you sign commits, unsigned otherwise.
              </p>
            )}

            {canForcePush && (
              <label className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={forcePush}
                  onChange={(e) => setForcePush(e.target.checked)}
                  disabled={isAmending}
                  className="h-4 w-4 accent-[var(--vscode-button-background)]"
                />
                <span className="text-sm text-[var(--vscode-foreground)]">Force Push after amended</span>
              </label>
            )}

            <CommandPreview command={buildAmendCommand({ includeStaged })} />
            {pushTarget && <CommandPreview command={buildPushCommand(pushTarget)} showLabel={false} />}

            {phase === 'waitingOnHooks' && (
              <p className={dialogNoteClassName}>
                Waiting on this repository&apos;s commit hooks. They can take a while; cancelling
                stops the wait, not the hooks themselves.
              </p>
            )}

            {error && <p className={dialogErrorClassName}>{error}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            {phase === 'waitingOnHooks' ? (
              <button type="button" onClick={() => rpcClient.cancelAmend()} className={buttonSecondaryClassName}>
                Cancel wait
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                disabled={isAmending}
                className={buttonSecondaryClassName}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={confirmDisabled}
              className={buttonPrimaryClassName}
            >
              {isAmending ? 'Amending…' : 'Amend Commit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
