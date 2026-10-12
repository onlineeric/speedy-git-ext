import { describe, expect, it } from 'vitest';
import { clampDialogPosition, DIALOG_MIN_VISIBLE_PX } from '../dialogPosition';

const viewport = { width: 1000, height: 800 };

describe('clampDialogPosition', () => {
  it('leaves an on-screen position unchanged', () => {
    expect(clampDialogPosition({ left: 100, top: 50 }, 400, viewport)).toEqual({ left: 100, top: 50 });
  });

  it('never lets the title row leave the top or bottom of the viewport', () => {
    expect(clampDialogPosition({ left: 100, top: -30 }, 400, viewport).top).toBe(0);
    expect(clampDialogPosition({ left: 100, top: 900 }, 400, viewport).top).toBe(800 - DIALOG_MIN_VISIBLE_PX);
  });

  it('keeps a grabbable strip visible horizontally', () => {
    expect(clampDialogPosition({ left: -1000, top: 0 }, 400, viewport).left).toBe(DIALOG_MIN_VISIBLE_PX - 400);
    expect(clampDialogPosition({ left: 2000, top: 0 }, 400, viewport).left).toBe(1000 - DIALOG_MIN_VISIBLE_PX);
  });

  it('pins the top to 0 in a viewport shorter than the visible strip', () => {
    expect(clampDialogPosition({ left: 0, top: 20 }, 400, { width: 1000, height: 30 }).top).toBe(0);
  });
});
