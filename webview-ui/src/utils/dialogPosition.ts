/** A dialog's top-left corner in viewport pixels, once the user has moved it. */
export interface DialogPosition {
  left: number;
  top: number;
}

/**
 * How much of a moved dialog must stay on screen. Enough to grab the title bar
 * again, so a dialog can never be dragged somewhere it cannot be dragged back from.
 */
export const DIALOG_MIN_VISIBLE_PX = 48;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Keeps a dragged dialog reachable: the title row (its top edge) never leaves the
 * viewport vertically, and at least `DIALOG_MIN_VISIBLE_PX` of its width stays
 * visible horizontally. The bottom may hang off screen — the title is the handle.
 */
export function clampDialogPosition(
  position: DialogPosition,
  dialogWidth: number,
  viewport: { width: number; height: number },
): DialogPosition {
  return {
    left: clamp(position.left, DIALOG_MIN_VISIBLE_PX - dialogWidth, viewport.width - DIALOG_MIN_VISIBLE_PX),
    top: clamp(position.top, 0, Math.max(0, viewport.height - DIALOG_MIN_VISIBLE_PX)),
  };
}
