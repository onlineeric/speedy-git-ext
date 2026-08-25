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
  dialogOverlayClassName,
} from './dialogStyles';
import { useDialogTelemetry } from '../hooks/useDialogTelemetry';

interface AmendCommitDialogProps {
  open: boolean;
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

const noteClassName =
  'rounded border border-[var(--vscode-panel-border)] px-3 py-2 text-sm text-[var(--vscode-descriptionForeground)]';

const warningClassName =
  'rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] px-3 py-2 text-sm text-[var(--vscode-inputValidation-warningForeground,var(--vscode-foreground))]';

const errorClassName =
  'rounded border border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)] px-3 py-2 text-sm whitespace-pre-wrap text-[var(--vscode-inputValidation-errorForeground,var(--vscode-foreground))]';

export function AmendCommitDialog({ open, commit, surface, onClose }: AmendCommitDialogProps) {
  const dialogTelemetry = useDialogTelemetry('amendCommit', open);

  const [message, setMessage] = useState('');
  const [messageLoaded, setMessageLoaded] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [includeStaged, setIncludeStaged] = useState(false);
  const [forcePush, setForcePush] = useState(false);
  const [isAmending, setIsAmending] = useState(false);
  const [waitingOnHooks, setWaitingOnHooks] = useState(false);
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
  // No state reset here: the menu mounts this component only while it is open,
  // so every open starts from the initial state above.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    rpcClient.getCommitMessage(commit.hash).then(
      (fullMessage) => {
        if (!cancelled) {
          setMessage(fullMessage);
          setMessageLoaded(true);
        }
      },
      () => {
        // Fall back to the subject rather than an empty box: the user can still
        // amend, and an empty prefill would invite confirming away the message.
        if (!cancelled) {
          setMessage(commit.subject);
          setMessageLoaded(true);
        }
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
  }, [open, commit.hash, commit.subject]);

  useEffect(() => () => clearTimeout(hookNoticeTimer.current), []);

  // Two separate questions, and they come apart: `isPublished` says the *commit*
  // is on a remote, which stays true when an unpublished branch merely shares a
  // tip with a published one. Offering a force push there would publish the
  // current branch for the first time — under a label that says force push, on a
  // branch whose absence of a remote is precisely what makes it private. So the
  // affordance needs both: the commit is out there, and this branch is too.
  const currentBranchIsPublished = hasRemoteCounterpart(branches, currentLocalBranch?.name);
  const canForcePush = isPublished && currentBranchIsPublished && currentLocalBranch !== null;
  const trimmedMessage = message.trim();
  const confirmDisabled = !messageLoaded || trimmedMessage.length === 0 || isAmending;

  const amendCommand = buildAmendCommand({ includeStaged });
  const pushCommand =
    canForcePush && forcePush && currentLocalBranch
      ? buildPushCommand({
          remote: resolveDefaultRemote(branches),
          branch: currentLocalBranch.name,
          setUpstream: false,
          forceMode: 'force-with-lease',
        })
      : null;

  const handleConfirm = async () => {
    dialogTelemetry.confirmed();
    if (includeStaged) trackUiInteraction(surface, 'amendIncludeStaged');
    if (canForcePush && forcePush) trackUiInteraction(surface, 'amendForcePush');

    setError(null);
    setIsAmending(true);
    hookNoticeTimer.current = setTimeout(() => setWaitingOnHooks(true), HOOK_WAIT_NOTICE_MS);

    try {
      await rpcClient.amendCommit(message, includeStaged, commit.hash);
    } catch (amendError) {
      // Every failure keeps the dialog open with the typed message intact — a
      // `commit-msg` hook that rejects at second 40 must not take the message
      // with it. Only success and the user's own cancel close it.
      setError(typeof amendError === 'string' ? amendError : String(amendError));
      setIsAmending(false);
      setWaitingOnHooks(false);
      clearTimeout(hookNoticeTimer.current);
      return;
    }
    clearTimeout(hookNoticeTimer.current);

    // The amend rewrote the tip, so its hash changed and the selection would
    // otherwise be dropped by the reload that follows.
    rpcClient.selectHeadAfterNextLoad();
    onClose();

    if (canForcePush && forcePush && currentLocalBranch) {
      try {
        await rpcClient.pushAsync(
          resolveDefaultRemote(branches),
          currentLocalBranch.name,
          false,
          'force-with-lease',
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
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
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
                value={messageLoaded ? message : ''}
                onChange={(e) => setMessage(e.target.value)}
                disabled={!messageLoaded || isAmending}
                rows={8}
                placeholder={messageLoaded ? 'Commit message…' : 'Loading commit message…'}
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

            {/* Gated on the same pair as the checkbox. When the commit is published
               only through some *other* branch's remote, this branch's amend
               rewrites nothing that is out there — the published copy is left
               untouched on its own ref — so "you will need to force push" would
               simply be untrue. */}
            {isPublished && currentBranchIsPublished && (
              <p className={warningClassName}>
                This commit already exists on a remote. Amending rewrites it, so the remote and your
                branch will disagree until you force push.
              </p>
            )}

            {isSigned && (
              <p className={noteClassName}>
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

            <CommandPreview command={amendCommand} />
            {pushCommand && <CommandPreview command={pushCommand} showLabel={false} />}

            {waitingOnHooks && (
              <p className={noteClassName}>
                Waiting on this repository&apos;s commit hooks. They can take a while; cancelling
                stops the wait, not the hooks themselves.
              </p>
            )}

            {error && <p className={errorClassName}>{error}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            {waitingOnHooks ? (
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
