import {
  DEFAULT_USER_SETTINGS,
  MIN_GIT_TIMEOUT_SECONDS,
  NO_GIT_TIMEOUT,
  normalizeGitTimeoutSeconds,
  parseGitTimeoutSeconds,
} from '@shared/types';

/**
 * The Git tab's timeout box, as a draft over `userSettings.gitTimeoutSeconds`.
 *
 * The draft is the raw text, so a half-typed value is never rewritten under the
 * user's cursor. Every comparison and every save goes through the shared
 * `normalizeGitTimeoutSeconds`, so what the box says it will save is exactly
 * what the backend applies.
 */

export function toGitTimeoutDraft(saved: number): string {
  return String(saved);
}

/** Changed means "would apply a different limit" — `060` over a saved `60` is not an edit. */
export function isGitTimeoutDraftChanged(draft: string, saved: number): boolean {
  return normalizeGitTimeoutSeconds(draft) !== saved;
}

/**
 * What Save writes. A box that does not hold a number of seconds — emptied, or
 * invalid — clears the setting (`null`), so it falls back to the default, as
 * the note under the box says, rather than pinning today's default value.
 */
export function gitTimeoutDraftToSave(draft: string): number | null {
  const seconds = parseGitTimeoutSeconds(draft);
  return seconds === undefined ? null : normalizeGitTimeoutSeconds(seconds);
}

/**
 * One line under the box saying what the typed value means, whenever that is
 * not simply "this many seconds" — so a value below the floor, 0, or an empty
 * box is never a surprise after saving. `undefined` when there is nothing to add.
 */
export function describeGitTimeoutDraft(draft: string): string | undefined {
  if (draft.trim() === '') return `Empty: uses the default, ${DEFAULT_USER_SETTINGS.gitTimeoutSeconds} seconds.`;
  const seconds = parseGitTimeoutSeconds(draft);
  if (seconds === undefined) {
    return `Not a valid number: uses the default, ${DEFAULT_USER_SETTINGS.gitTimeoutSeconds} seconds.`;
  }
  if (seconds === NO_GIT_TIMEOUT) return 'No timeout: git commands are never stopped.';
  if (seconds < MIN_GIT_TIMEOUT_SECONDS) return `Below the minimum: uses ${MIN_GIT_TIMEOUT_SECONDS} seconds.`;
  return undefined;
}
