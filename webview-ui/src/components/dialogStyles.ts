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
