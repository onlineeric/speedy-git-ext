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
