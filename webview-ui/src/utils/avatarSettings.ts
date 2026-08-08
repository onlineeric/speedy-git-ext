/**
 * Bounds for the avatar refresh window, mirroring `speedyGit.avatars.refreshDays`
 * in package.json. Kept here so the input can constrain itself without reaching
 * into backend-only code.
 */
export const MIN_AVATAR_REFRESH_DAYS = 1;
export const MAX_AVATAR_REFRESH_DAYS = 365;

/**
 * Turn whatever is in the refresh-days input into a value worth sending.
 *
 * The field is free text while being edited, so this is the one place that
 * decides what an empty box, a typo, or an out-of-range number means: fall back
 * to the current setting rather than clearing it, and clamp instead of
 * rejecting, so the user never has to guess the valid range.
 */
export function clampRefreshDaysInput(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_AVATAR_REFRESH_DAYS, Math.max(MIN_AVATAR_REFRESH_DAYS, parsed));
}
