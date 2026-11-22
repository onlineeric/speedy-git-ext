import { describe, expect, it } from 'vitest';
import {
  decideRowClick,
  isCheckoutGesture,
  onBadgeDoubleClick,
  onDetailsArrived,
  onHoldWindowElapsed,
  type DetailsPanelHold,
} from '../detailsPanelHold';

const waiting: DetailsPanelHold = { hash: 'abc', phase: 'waiting' };
const detailsReady: DetailsPanelHold = { ...waiting, phase: 'detailsReady' };
const suppressed: DetailsPanelHold = { ...waiting, phase: 'suppressed' };

describe('decideRowClick', () => {
  it('selects normally anywhere off a checkout badge, whatever the panel or click count', () => {
    expect(decideRowClick({ onCheckoutBadge: false, clickCount: 1, detailsPanelOpen: false })).toBe('select');
    expect(decideRowClick({ onCheckoutBadge: false, clickCount: 2, detailsPanelOpen: false })).toBe('select');
  });

  it('holds a closed panel on the first click of a checkout badge', () => {
    expect(decideRowClick({ onCheckoutBadge: true, clickCount: 1, detailsPanelOpen: false })).toBe('selectAndHold');
  });

  it('does not delay an open panel, which only changes content', () => {
    expect(decideRowClick({ onCheckoutBadge: true, clickCount: 1, detailsPanelOpen: true })).toBe('select');
  });

  it('treats the second click of a badge double-click as part of the double-click', () => {
    expect(decideRowClick({ onCheckoutBadge: true, clickCount: 2, detailsPanelOpen: false })).toBe('badgeSecondClick');
    expect(decideRowClick({ onCheckoutBadge: true, clickCount: 2, detailsPanelOpen: true })).toBe('badgeSecondClick');
  });
});

describe('a single click: the panel opens once both the window and the details are done', () => {
  it('details first, then the window ends', () => {
    const arrived = onDetailsArrived(waiting, 'abc');
    expect(arrived).toEqual({ hold: detailsReady, open: false });
    expect(onHoldWindowElapsed(arrived.hold)).toEqual({ hold: null, open: true });
  });

  it('the window ends first, then the details open the panel as usual', () => {
    const elapsed = onHoldWindowElapsed(waiting);
    expect(elapsed).toEqual({ hold: null, open: false });
    expect(onDetailsArrived(elapsed.hold, 'abc')).toEqual({ hold: null, open: true });
  });
});

describe('a double-click inside the window keeps the panel closed', () => {
  it('when the details had already arrived', () => {
    const hold = onBadgeDoubleClick(onDetailsArrived(waiting, 'abc').hold, 'abc');
    expect(hold).toBeNull();
    expect(onHoldWindowElapsed(hold).open).toBe(false);
  });

  it('when the details arrive afterwards', () => {
    const hold = onBadgeDoubleClick(waiting, 'abc');
    expect(hold).toEqual(suppressed);
    expect(onHoldWindowElapsed(hold)).toEqual({ hold: suppressed, open: false });
    expect(onDetailsArrived(hold, 'abc')).toEqual({ hold: null, open: false });
  });

  it('even when the same commit\'s details were loaded earlier and this click\'s are still in flight', () => {
    // The hold does not know about the stale load, so it waits for this request's answer.
    const hold = onBadgeDoubleClick(waiting, 'abc');
    expect(hold).toEqual(suppressed);
    expect(onDetailsArrived(hold, 'abc').open).toBe(false);
  });
});

describe('a slower double-click falls back to the old behaviour', () => {
  it('ignores a second click once the window has ended', () => {
    expect(onBadgeDoubleClick(null, 'abc')).toBeNull();
  });
});

describe('another commit is never held', () => {
  it('opens the panel for other details and keeps the pending hold', () => {
    expect(onDetailsArrived(waiting, 'other')).toEqual({ hold: waiting, open: true });
  });

  it('ignores a double-click for a different commit', () => {
    expect(onBadgeDoubleClick(waiting, 'other')).toBe(waiting);
  });

  it('opens the panel when nothing is held, as always', () => {
    expect(onDetailsArrived(null, 'abc')).toEqual({ hold: null, open: true });
  });
});

describe('isCheckoutGesture', () => {
  const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

  it('accepts a plain primary-button click', () => {
    expect(isCheckoutGesture(plain)).toBe(true);
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])('rejects a %s click', (modifier) => {
    expect(isCheckoutGesture({ ...plain, [modifier]: true })).toBe(false);
  });

  it('rejects other buttons', () => {
    expect(isCheckoutGesture({ ...plain, button: 1 })).toBe(false);
  });
});
