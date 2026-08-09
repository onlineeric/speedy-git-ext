/**
 * Semantic colors, expressed as VS Code theme tokens.
 *
 * The webview renders inside the user's editor and VS Code redefines these tokens
 * for whatever theme the user picked, so every color must come from one. A fixed
 * palette color looks right in the theme it was written against and wrong in every
 * other one.
 *
 * These constants name the *meaning* (added, deleted, warning, accent) rather than
 * the token, so a call site does not have to rediscover which of VS Code's several
 * hundred tokens carries it. Git status colors deliberately reuse the SCM view's
 * own tokens, so a file marked "modified" here matches the same file in the
 * Explorer.
 *
 * Two forms are exported on purpose. The `*_COLOR` constants are plain CSS values
 * for inline `style`, which is what a call site needs when the color is chosen at
 * runtime — Tailwind's JIT only emits classes it can see spelled out in the source,
 * so `text-[${SOME_COLOR}]` would compile to a class that never exists. The
 * `*ClassName` constants are spelled-out classes, for the few call sites that need
 * a hover or other pseudo-state alongside the color.
 */

export const ADDED_COLOR = 'var(--vscode-gitDecoration-addedResourceForeground)';
export const MODIFIED_COLOR = 'var(--vscode-gitDecoration-modifiedResourceForeground)';
export const DELETED_COLOR = 'var(--vscode-gitDecoration-deletedResourceForeground)';
/** Also used for copied files — git treats C as a variant of R, and VS Code has no separate token. */
export const RENAMED_COLOR = 'var(--vscode-gitDecoration-renamedResourceForeground)';
export const UNTRACKED_COLOR = 'var(--vscode-gitDecoration-untrackedResourceForeground)';
export const NEUTRAL_COLOR = 'var(--vscode-descriptionForeground)';

/**
 * The uncommitted-changes row: its message text and its dashed graph node and
 * edges. Shared so the two never drift — they read as one thing on screen.
 *
 * Uncommitted work *is* modification, so the SCM "modified" token is the honest
 * one, and it is the tan/amber this accent was hand-picked as in the first place.
 * The old hardcoded value stays as a fallback for themes that leave it undefined,
 * where it still needs to stand apart from the graph lane colors.
 */
export const UNCOMMITTED_COLOR = 'var(--vscode-gitDecoration-modifiedResourceForeground, #E8A317)';

export const WARNING_COLOR = 'var(--vscode-editorWarning-foreground)';
export const ERROR_COLOR = 'var(--vscode-errorForeground)';

/** Toolbar toggles and popover triggers that are currently active. */
export const ACCENT_COLOR = 'var(--vscode-textLink-activeForeground)';

/** Compare panel slot badges. Charts tokens are theme-defined and stay distinguishable from each other. */
export const COMPARE_BASE_COLOR = 'var(--vscode-charts-blue)';
export const COMPARE_TARGET_COLOR = 'var(--vscode-charts-green)';
/** Text drawn on top of a solid accent fill; the editor background is the reliable contrast partner. */
export const ON_ACCENT_COLOR = 'var(--vscode-editor-background)';

/**
 * A faint fill of `color`, for chips and badges that tint their background to
 * match their text. VS Code has no "20% of this token" tokens, and hardcoding the
 * faded shade would reintroduce exactly the problem these constants solve.
 */
export function tint(color: string, percent = 18): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/**
 * Spelled-out class equivalents of the constants above. These must stay written
 * out in full for Tailwind to emit them, so they mirror rather than reference the
 * values — keep the two in step when changing a token.
 */
export const accentTextClassName = 'text-[var(--vscode-textLink-activeForeground)]';
export const warningTextClassName = 'text-[var(--vscode-editorWarning-foreground)]';
