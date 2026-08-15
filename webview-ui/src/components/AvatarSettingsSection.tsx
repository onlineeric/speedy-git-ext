import { useEffect, useRef, useState } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { trackDialogOutcome, trackUiInteraction } from '../utils/telemetry';
import { MAX_AVATAR_REFRESH_DAYS, MIN_AVATAR_REFRESH_DAYS, clampAvatarRefreshDays } from '@shared/types';
import { buttonPrimaryClassName, buttonSecondaryClassName, dialogSectionLabelClassName } from './dialogStyles';

/**
 * Avatars section of the View popover.
 *
 * Two variants: an explanation plus the Allow button while unauthorized, and a
 * connected summary plus Remove token once authorized. The refresh-days input
 * is shown in both, since it governs the cache either way.
 */
export function AvatarSettingsSection() {
  const authState = useGraphStore((state) => state.avatarAuthState);
  const refreshDays = useGraphStore((state) => state.userSettings.avatarRefreshDays);
  const [draftDays, setDraftDays] = useState(String(refreshDays));
  // The GitHub consent prompt is VS Code's, not ours, so its outcome only shows
  // up as the auth state that comes back. Latch the click and read the answer.
  const awaitingAuthAnswer = useRef(false);

  // Settings can change from the VS Code settings UI too, so follow the store
  // whenever the user is not mid-edit here.
  useEffect(() => {
    setDraftDays(String(refreshDays));
  }, [refreshDays]);

  useEffect(() => {
    if (!awaitingAuthAnswer.current) return;
    awaitingAuthAnswer.current = false;
    trackDialogOutcome('avatarAuthorize', authState.authorized ? 'confirmed' : 'cancelled');
  }, [authState]);

  const commitDays = () => {
    const parsed = clampAvatarRefreshDays(draftDays, refreshDays);
    setDraftDays(String(parsed));
    if (parsed === refreshDays) return;
    trackUiInteraction('avatarSettings', 'avatarRefreshDaysChange');
    rpcClient.setAvatarRefreshDays(parsed);
  };

  const handleAuthorize = () => {
    trackUiInteraction('avatarSettings', 'avatarAuthorizeClick');
    awaitingAuthAnswer.current = true;
    rpcClient.requestGitHubAuth();
  };

  const handleClearCache = () => {
    trackUiInteraction('avatarSettings', 'avatarClearCache');
    rpcClient.clearAvatarCache();
  };

  const handleRemoveToken = () => {
    trackUiInteraction('avatarSettings', 'avatarRemoveTokenClick');
    rpcClient.removeGitHubAuth();
  };

  return (
    <section>
      <div className={dialogSectionLabelClassName}>Avatars</div>

      {authState.authorized ? (
        <ConnectedDescription accountLabel={authState.accountLabel} />
      ) : (
        <UnauthorizedDescription />
      )}

      {authState.rateLimitResetAt !== null && (
        <p
          role="note"
          className="mb-2 text-[11px] leading-4 text-[var(--vscode-editorWarning-foreground)]"
        >
          GitHub lookup limit reached. Refreshing resumes at{' '}
          {new Date(authState.rateLimitResetAt).toLocaleTimeString()}. Avatars already cached keep showing.
        </p>
      )}

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleAuthorize}
          disabled={authState.authorized}
          className={`${buttonPrimaryClassName} text-xs`}
          title={
            authState.authorized
              ? 'Speedy Git is already authorized to look up avatars'
              : 'Sign in to GitHub so avatars can be looked up at the higher rate limit'
          }
        >
          Allow avatar lookup
        </button>

        {authState.authorized && (
          <button
            type="button"
            onClick={handleRemoveToken}
            className={`${buttonSecondaryClassName} text-xs`}
            title="Stop using your GitHub sign-in for avatar lookups"
          >
            Remove token
          </button>
        )}
      </div>

      <label className="mb-3 flex items-center justify-between gap-2 text-xs text-[var(--vscode-descriptionForeground)]">
        <span>Refresh avatars every</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            min={MIN_AVATAR_REFRESH_DAYS}
            max={MAX_AVATAR_REFRESH_DAYS}
            value={draftDays}
            onChange={(event) => setDraftDays(event.target.value)}
            onBlur={commitDays}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            className="w-16 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-1.5 py-1 text-right text-[var(--vscode-input-foreground)] focus:border-[var(--vscode-focusBorder)] focus:outline-none"
            aria-label="Days before an avatar is refreshed"
          />
          <span>days</span>
        </span>
      </label>

      <div className="border-t border-[var(--vscode-panel-border)] pt-3">
        <button
          type="button"
          onClick={handleClearCache}
          className={`${buttonSecondaryClassName} w-full text-xs`}
          title="Forget every cached avatar and look them all up again"
        >
          Clear all cached avatars
        </button>
        <p className="mt-1.5 text-[11px] leading-4 text-[var(--vscode-descriptionForeground)]">
          Avatars disappear and are looked up again from scratch, about one per second.
        </p>
      </div>
    </section>
  );
}

function UnauthorizedDescription() {
  return (
    <div className="mb-3 space-y-2 text-xs leading-4 text-[var(--vscode-descriptionForeground)]">
      <p>Show author profile pictures from GitHub.</p>
      <p>
        Not signed in — <strong>60</strong> lookups/hour, shared with everyone on your network.
        <br />
        Signed in — <strong>5,000</strong> lookups/hour, just for you.
      </p>
      <p>Clicking the button below will:</p>
      <ul className="ml-4 list-disc space-y-0.5">
        <li>Open GitHub in your browser</li>
        <li>Ask you to allow Speedy Git access</li>
        <li>Return you to VS Code</li>
      </ul>
      <p>
        Used <strong>only</strong> to fetch author avatars. Speedy Git never reads, changes, or sends
        your code. Private repository access is requested so avatars also work in private repos.
      </p>
    </div>
  );
}

function ConnectedDescription({ accountLabel }: { accountLabel: string | null }) {
  return (
    <div className="mb-3 space-y-2 text-xs leading-4 text-[var(--vscode-descriptionForeground)]">
      <p className="text-[var(--vscode-foreground)]">
        ✓ Connected{accountLabel ? ` as ${accountLabel}` : ''} — 5,000 lookups/hour.
      </p>
      <p>
        “Remove token” makes Speedy Git stop using your GitHub sign-in. To fully revoke access, use
        VS Code’s Accounts menu.
      </p>
    </div>
  );
}
