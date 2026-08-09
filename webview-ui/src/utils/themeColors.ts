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
 * They are plain CSS values, for inline `style`. That is deliberate: Tailwind's JIT
 * only emits classes it can see spelled out in the source, so `text-[${SOME_COLOR}]`
 * would compile to a class that never exists. A call site that also needs a
 * pseudo-state pairs the inline color with a class carrying only the state
 * (`opacity-70 hover:opacity-100`), rather than moving the color into the class.
 */

export const ADDED_COLOR = 'var(--vscode-gitDecoration-addedResourceForeground)';
export const MODIFIED_COLOR = 'var(--vscode-gitDecoration-modifiedResourceForeground)';
export const DELETED_COLOR = 'var(--vscode-gitDecoration-deletedResourceForeground)';
/** Also used for copied files — git treats C as a variant of R, and VS Code has no separate token. */
export const RENAMED_COLOR = 'var(--vscode-gitDecoration-renamedResourceForeground)';
export const UNTRACKED_COLOR = 'var(--vscode-gitDecoration-untrackedResourceForeground)';
export const NEUTRAL_COLOR = 'var(--vscode-descriptionForeground)';
export const FOREGROUND_COLOR = 'var(--vscode-foreground)';

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
export const ICON_COLOR = 'var(--vscode-icon-foreground)';

/** Compare panel slot badges. Charts tokens are theme-defined and stay distinguishable from each other. */
export const COMPARE_BASE_COLOR = 'var(--vscode-charts-blue)';
export const COMPARE_TARGET_COLOR = 'var(--vscode-charts-green)';
/** Text drawn on top of a solid accent fill; the editor background is the reliable contrast partner. */
export const ON_ACCENT_COLOR = 'var(--vscode-editor-background)';

/**
 * Filled surfaces, paired with the foreground token the theme intends for them.
 * `WARNING_SURFACE_COLOR` is the block VS Code uses for a validation warning;
 * `BADGE_*` is its neutral count/label chip.
 */
export const WARNING_SURFACE_COLOR = 'var(--vscode-inputValidation-warningBackground)';
export const BADGE_SURFACE_COLOR = 'var(--vscode-badge-background)';
export const BADGE_TEXT_COLOR = 'var(--vscode-badge-foreground)';

/**
 * Commit signature verdicts. Shared by the history column's glyphs
 * (`utils/signatureGlyph.ts`) and the details panel's labels, which sit on screen
 * together — a "Verified" label in a different green from the tick beside it reads
 * as a second state.
 *
 * These three carry hex fallbacks because their tokens are contributed by VS Code's
 * built-in Git extension rather than by themes, so a user who disables it would
 * otherwise get no color at all. The tokens above are core theme colors and always
 * resolve.
 */
export const SIGNATURE_VERIFIED_COLOR = 'var(--vscode-testing-iconPassed, #4CAF50)';
export const SIGNATURE_PROBLEM_COLOR = 'var(--vscode-editorError-foreground, #F44336)';
export const SIGNATURE_CANNOT_VERIFY_COLOR = 'var(--vscode-editorWarning-foreground, #FFCC00)';

/**
 * A faint fill of `color`, for chips and badges that tint their background to
 * match their text. VS Code has no "20% of this token" tokens, and hardcoding the
 * faded shade would reintroduce exactly the problem these constants solve.
 */
export function tint(color: string, percent = 18): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}
