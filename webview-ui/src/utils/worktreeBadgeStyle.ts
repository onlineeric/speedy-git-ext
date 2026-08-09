/**
 * Deliberate hardcoded colors, in the same class as `colorUtils.ts`'s luminance
 * pick: this border has to stay visible against a *user-configured* lane color
 * (`speedyGit.graphColors`), which no theme token knows anything about. Deriving
 * it from one would defeat the contrast choice `isYellowTone` exists to make —
 * the border would sometimes land on top of a lane of the same color.
 */
const WORKTREE_BADGE_BORDER_COLOR = '#facc15';
const WORKTREE_BADGE_BORDER_COLOR_ON_YELLOW = '#ef4444';

export function worktreeBadgeBorderColor(borderColor: unknown): string {
  return isYellowTone(borderColor) ? WORKTREE_BADGE_BORDER_COLOR_ON_YELLOW : WORKTREE_BADGE_BORDER_COLOR;
}

function isYellowTone(color: unknown): boolean {
  if (typeof color !== 'string' || !color.startsWith('#')) return false;

  const hex = color.slice(1);
  const normalized = hex.length === 3
    ? hex.split('').map((char) => char + char).join('')
    : hex.slice(0, 6);
  if (normalized.length !== 6) return false;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return red >= 180 && green >= 130 && blue <= 100;
}
