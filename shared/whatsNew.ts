/**
 * Whether the "What's new" dialog opens on this run, and how long its close
 * button stays disabled.
 *
 * The decision is pure and lives here rather than in the extension host so it
 * can be tested without a `vscode` stub, and so the countdown is defined once
 * for the backend that sends it and the webview that counts it down.
 */

/**
 * Close stays disabled this long, so the dialog is read rather than reflexively
 * dismissed. One value for every build: three seconds is short enough that F5
 * debugging — where the dialog opens on *every* launch — does not need its own
 * shorter one.
 */
export const WHATS_NEW_COUNTDOWN_SECONDS = 3;

export interface WhatsNewDecision {
  show: boolean;
  countdownSeconds: number;
  /**
   * What the webview compares its resolved entry against. Withheld in
   * development, so no stored value can suppress the dialog there.
   */
  lastShownVersion: string | undefined;
}

/** What the backend sends when a run qualifies; the webview picks the entry. */
export interface WhatsNewPayload {
  /** The running extension's version. */
  version: string;
  lastShownVersion: string | undefined;
  countdownSeconds: number;
}

export interface WhatsNewDecisionInput {
  /** Version of the running extension, from `package.json`. */
  currentVersion: string;
  /** Entry version whose dialog was last dismissed; `undefined` before the first ever dismissal. */
  lastShownVersion: string | undefined;
  /** True under `ExtensionMode.Development` (F5 debugging). */
  isDevelopment: boolean;
}

/**
 * Development always shows the dialog, so a change to its content can be seen by
 * relaunching rather than by clearing state by hand.
 *
 * A release build offers it whenever the running version differs from the
 * stored one, in either direction: a first install has nothing stored, an
 * upgrade and a downgrade both differ. This is only the backend's half — what is
 * stored is the *entry* version last dismissed, so a patch release (5.18.1 after
 * 5.18.0 was seen) is offered too, and the webview, which owns the entries,
 * stays silent through `chooseWhatsNewEntryVersion`. Note that re-installing the *same* version is
 * indistinguishable from restarting on it — the version string is all we have to
 * compare — so that case re-shows only if VS Code discarded the stored value
 * along with the extension.
 */
export function decideWhatsNew({
  currentVersion,
  lastShownVersion,
  isDevelopment,
}: WhatsNewDecisionInput): WhatsNewDecision {
  return {
    show: isDevelopment || lastShownVersion !== currentVersion,
    countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS,
    lastShownVersion: isDevelopment ? undefined : lastShownVersion,
  };
}

/**
 * Whether closing the dialog should be recorded as "this entry has been seen".
 *
 * Never under F5 debugging. The Extension Development Host is launched without
 * `--user-data-dir`, so it shares one `globalState` with the normal window under
 * the same extension id — a dismissal there would write the version the
 * *installed* extension is about to check, and the release build would then stay
 * silent on the very upgrade the dialog exists for. Development re-shows the
 * dialog on every launch regardless, so there is nothing for it to record and
 * nothing lost by not recording it.
 */
export function shouldRecordWhatsNew(isDevelopment: boolean): boolean {
  return !isDevelopment;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

/** Parses an exact `N.N.N` version; anything else (a pre-release, a stray `v`) is `undefined`. */
function parseExactVersion(version: string): ParsedVersion | undefined {
  const parts = version.split('.');
  if (parts.length !== 3 || !parts.every((part) => /^\d+$/.test(part))) return undefined;
  const [major, minor, patch] = parts.map(Number);
  return { major, minor, patch };
}

/** Whether a string is an exact `N.N.N` version — the only shape a release or an entry can have. */
export function isExactVersion(version: string): boolean {
  return parseExactVersion(version) !== undefined;
}

/**
 * Which release notes describe the running version: the newest entry in the same
 * `major.minor` series whose patch is at or below the running one.
 *
 * A patch release usually has no notes of its own and inherits its series' —
 * 5.18.1 shows 5.18.0's — so a user who jumps straight from 5.17 to 5.18.1 still
 * sees what 5.18 brought. A patch that *does* have its own entry (5.10.1 credited
 * an issue reporter) takes over from that patch onward. `undefined` means the
 * series has nothing to announce.
 */
export function resolveWhatsNewEntryVersion(
  currentVersion: string,
  entryVersions: readonly string[],
): string | undefined {
  const current = parseExactVersion(currentVersion);
  if (!current) return undefined;

  let best: { version: string; patch: number } | undefined;
  for (const version of entryVersions) {
    const entry = parseExactVersion(version);
    if (!entry || entry.major !== current.major || entry.minor !== current.minor) continue;
    if (entry.patch > current.patch) continue;
    if (!best || entry.patch > best.patch) best = { version, patch: entry.patch };
  }
  return best?.version;
}

export interface WhatsNewEntryChoiceInput {
  currentVersion: string;
  /**
   * The *entry* version whose dialog was last dismissed — not the running
   * version at the time, which is what lets a patch release recognise its
   * series' notes as already seen. `undefined` before the first dismissal, and
   * always in development so the dialog re-shows on every launch.
   */
  lastShownVersion: string | undefined;
  entryVersions: readonly string[];
}

/**
 * The entry to show on this run, or `undefined` when there is none or the user
 * already dismissed it. "Seen" is per entry, so the dialog shows once per
 * release that has notes, however many patches without notes follow it. Any
 * other stored value — an older series, or a newer one after a downgrade —
 * shows the entry, matching `decideWhatsNew`'s "any change" rule.
 */
export function chooseWhatsNewEntryVersion({
  currentVersion,
  lastShownVersion,
  entryVersions,
}: WhatsNewEntryChoiceInput): string | undefined {
  const entryVersion = resolveWhatsNewEntryVersion(currentVersion, entryVersions);
  return entryVersion === lastShownVersion ? undefined : entryVersion;
}
