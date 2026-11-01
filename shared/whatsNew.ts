/**
 * The "What's new" rules shared by the backend and the webview: what the
 * backend offers, which entry a version resolves to, whether it was seen, and
 * how long the close button stays disabled.
 *
 * They are pure and live here rather than in the extension host so they can be
 * tested without a `vscode` stub, and so the countdown is defined once for the
 * backend that sends it and the webview that counts it down.
 */

/**
 * Close stays disabled this long, so the dialog is read rather than reflexively
 * dismissed. One value for every build: three seconds is short enough that F5
 * debugging — where the dialog opens on *every* launch — does not need its own
 * shorter one.
 */
export const WHATS_NEW_COUNTDOWN_SECONDS = 3;

/** What the backend offers the first graph of a session; the webview decides from it. */
export interface WhatsNewPayload {
  /** The running extension's version. */
  version: string;
  /**
   * The *entry* version whose dialog was last dismissed — not the running
   * version at the time, which is what lets a patch release recognise its
   * series' notes as already seen. `undefined` before the first dismissal, and
   * always in development.
   */
  lastShownVersion: string | undefined;
  countdownSeconds: number;
}

export interface WhatsNewPayloadInput {
  /** Version of the running extension, from `package.json`. */
  currentVersion: string;
  /** Entry version stored at the last dismissal. */
  storedVersion: string | undefined;
  /** True under `ExtensionMode.Development` (F5 debugging). */
  isDevelopment: boolean;
}

/**
 * Development withholds the stored version, so no dismissal can suppress the
 * dialog and a change to its content can be seen by relaunching rather than by
 * clearing state by hand. Whether a release build shows anything is decided by
 * `chooseUnseenWhatsNewEntry` alone — the backend knows nothing about entries.
 */
export function buildWhatsNewPayload({
  currentVersion,
  storedVersion,
  isDevelopment,
}: WhatsNewPayloadInput): WhatsNewPayload {
  return {
    version: currentVersion,
    lastShownVersion: isDevelopment ? undefined : storedVersion,
    countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS,
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
export function resolveWhatsNewEntry<T extends { version: string }>(
  currentVersion: string,
  entries: readonly T[],
): T | undefined {
  const current = parseExactVersion(currentVersion);
  if (!current) return undefined;

  let best: { entry: T; patch: number } | undefined;
  for (const entry of entries) {
    const version = parseExactVersion(entry.version);
    if (!version || version.major !== current.major || version.minor !== current.minor) continue;
    if (version.patch > current.patch) continue;
    if (!best || version.patch > best.patch) best = { entry, patch: version.patch };
  }
  return best?.entry;
}

/**
 * The entry to show on this run, or `undefined` when there is none or the user
 * already dismissed it. "Seen" is per entry, so the dialog shows once per
 * release that has notes, however many patches without notes follow it. Any
 * other stored value — an older series, or a newer one after a downgrade —
 * shows the entry.
 *
 * Re-installing the *same* version is indistinguishable from restarting on it,
 * so that case re-shows only if VS Code discarded the stored value along with
 * the extension.
 */
export function chooseUnseenWhatsNewEntry<T extends { version: string }>(
  { version, lastShownVersion }: Pick<WhatsNewPayload, 'version' | 'lastShownVersion'>,
  entries: readonly T[],
): T | undefined {
  const entry = resolveWhatsNewEntry(version, entries);
  return entry?.version === lastShownVersion ? undefined : entry;
}

/**
 * Entries newest first, for browsing release notes from version to version.
 * Sorted by version rather than trusting the file's order, so an entry pasted
 * in the wrong place still lands where it belongs. A malformed version (which
 * `whatsNewEntries`' test rejects anyway) sorts last.
 */
export function sortWhatsNewEntriesNewestFirst<T extends { version: string }>(entries: readonly T[]): T[] {
  const rank = (entry: T) => parseExactVersion(entry.version);
  return [...entries].sort((a, b) => {
    const left = rank(a);
    const right = rank(b);
    if (!left || !right) return left ? -1 : right ? 1 : 0;
    return right.major - left.major || right.minor - left.minor || right.patch - left.patch;
  });
}

/**
 * The entries either side of `version` in a newest-first list: `older` is what
 * the dialog's back arrow opens, `newer` its forward arrow. Each is `undefined`
 * at its end of the list, which is what disables that arrow.
 */
export function adjacentWhatsNewEntries<T extends { version: string }>(
  newestFirst: readonly T[],
  version: string,
): { older: T | undefined; newer: T | undefined } {
  const index = newestFirst.findIndex((entry) => entry.version === version);
  if (index === -1) return { older: undefined, newer: undefined };
  return { older: newestFirst[index + 1], newer: newestFirst[index - 1] };
}
