/**
 * Whether the "What's new" dialog opens on this run, and how long its close
 * button stays disabled.
 *
 * The decision is pure and lives here rather than in the extension host so it
 * can be tested without a `vscode` stub, and so the countdown constants are
 * defined once for the backend that sends them and the webview that counts them
 * down.
 */

/** Close stays disabled this long in a released build, so the dialog is read rather than reflexively dismissed. */
export const WHATS_NEW_COUNTDOWN_SECONDS = 5;

/**
 * Shorter under F5 debugging, where the dialog opens on *every* launch — a
 * 5-second wait each time would make the extension tedious to develop against.
 */
export const WHATS_NEW_DEV_COUNTDOWN_SECONDS = 2;

export interface WhatsNewDecision {
  show: boolean;
  countdownSeconds: number;
}

export interface WhatsNewDecisionInput {
  /** Version of the running extension, from `package.json`. */
  currentVersion: string;
  /** Version whose dialog was last dismissed; `undefined` before the first ever run. */
  lastShownVersion: string | undefined;
  /** True under `ExtensionMode.Development` (F5 debugging). */
  isDevelopment: boolean;
}

/**
 * Development always shows the dialog, so a change to its content can be seen by
 * relaunching rather than by clearing state by hand.
 *
 * A release build shows it once per *version*, on any change in either
 * direction: a first install has nothing stored, an upgrade and a downgrade both
 * differ from what was stored. Note that re-installing the *same* version is
 * indistinguishable from restarting on it — the version string is all we have to
 * compare — so that case re-shows only if VS Code discarded the stored value
 * along with the extension.
 */
export function decideWhatsNew({
  currentVersion,
  lastShownVersion,
  isDevelopment,
}: WhatsNewDecisionInput): WhatsNewDecision {
  if (isDevelopment) {
    return { show: true, countdownSeconds: WHATS_NEW_DEV_COUNTDOWN_SECONDS };
  }

  return {
    show: lastShownVersion !== currentVersion,
    countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS,
  };
}
