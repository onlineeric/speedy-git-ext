import type { CSSProperties } from 'react';

/**
 * Shared sizing for dialog / popup content.
 *
 * Uses a wide default so live git command previews fit on one line, and a
 * drag handle (`resize: horizontal`) so the user can widen further when a
 * command is unusually long. Width is bounded so it stays usable on small
 * and very large screens.
 *
 * Applied to every dialog's `<Dialog.Content>` / `<AlertDialog.Content>` for a
 * consistent look. Because width is set here, the corresponding components no
 * longer carry Tailwind `w-[90vw] max-w-*` width utilities.
 */
export const dialogContentStyle: CSSProperties = {
  resize: 'horizontal',
  overflow: 'auto',
  width: '48rem',
  minWidth: '400px',
  maxWidth: '90vw',
};

/**
 * Shared chrome (positioning, padding, border, surface) for dialog / popup
 * content, paired with `dialogContentStyle` for sizing. Centralized so a change
 * to dialog appearance is made once rather than across every dialog. Dialogs that
 * need extra layout (scrolling lists) append utilities, e.g.
 * `${dialogContentClassName} flex max-h-[80vh] flex-col`.
 */
export const dialogContentClassName =
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-lg shadow-xl bg-[var(--vscode-editor-background)] border border-[var(--vscode-panel-border)] z-50';

/**
 * The two button variants VS Code themes define, so buttons re-colour with the
 * user's theme instead of being pinned to one palette.
 *
 * `primary` is the confirming action — one per dialog. `secondary` is everything
 * else: cancel, close, and side actions. A button with no background at all
 * reads as a label until hovered, so prefer `secondary` over a bare text style
 * for anything the user is meant to click.
 *
 * Sizing is deliberately not baked in beyond padding; callers add width or text
 * size utilities as needed.
 */
export const buttonPrimaryClassName =
  'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:cursor-default disabled:opacity-50';

export const buttonSecondaryClassName =
  'px-3 py-1.5 text-sm rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:cursor-default disabled:opacity-50';

/**
 * Caption above a group of settings inside a dialog.
 *
 * Shared because the View settings dialog stands several of these side by side —
 * captions that sit next to each other are exactly the ones that must not drift
 * apart in weight or spacing.
 */
export const dialogSectionLabelClassName =
  'mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--vscode-descriptionForeground)]';
