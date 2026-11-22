import { describe, expect, it } from 'vitest';
import {
  decideRowClick,
  onBadgeDoubleClick,
  onDetailsArrived,
  onHoldWindowElapsed,
  type DetailsPanelHold,
} from '../detailsPanelHold';

const waiting: DetailsPanelHold = { hash: 'abc', phase: 'waiting' };
const suppressed: DetailsPanelHold = { hash: 'abc', phase: 'suppressed' };

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
    expect(arrived).toEqual({ hold: waiting, open: false });
    expect(onHoldWindowElapsed(arrived.hold, 'abc', 'abc')).toEqual({ hold: null, open: true });
  });

  it('the window ends first, then the details open the panel as usual', () => {
    const elapsed = onHoldWindowElapsed(waiting, 'abc', undefined);
    expect(elapsed).toEqual({ hold: null, open: false });
    expect(onDetailsArrived(elapsed.hold, 'abc')).toEqual({ hold: null, open: true });
  });
});

describe('a double-click inside the window keeps the panel closed', () => {
  it('when the details had already arrived', () => {
    const hold = onBadgeDoubleClick(onDetailsArrived(waiting, 'abc').hold, 'abc', 'abc');
    expect(hold).toBeNull();
    expect(onHoldWindowElapsed(hold, 'abc', 'abc').open).toBe(false);
  });

  it('when the details arrive afterwards', () => {
    const hold = onBadgeDoubleClick(waiting, 'abc', undefined);
    expect(hold).toEqual(suppressed);
    expect(onHoldWindowElapsed(hold, 'abc', undefined)).toEqual({ hold: suppressed, open: false });
    expect(onDetailsArrived(hold, 'abc')).toEqual({ hold: null, open: false });
  });
});

describe('a slower double-click falls back to the old behaviour', () => {
  it('ignores a second click once the window has ended', () => {
    expect(onBadgeDoubleClick(null, 'abc', 'abc')).toBeNull();
  });
});

describe('another commit is never held', () => {
  it('opens the panel for other details and keeps the pending hold', () => {
    expect(onDetailsArrived(waiting, 'other')).toEqual({ hold: waiting, open: true });
  });

  it('ignores a window ending or a double-click for a different commit', () => {
    expect(onHoldWindowElapsed(waiting, 'other', 'other')).toEqual({ hold: waiting, open: false });
    expect(onBadgeDoubleClick(waiting, 'other', undefined)).toBe(waiting);
  });

  it('opens the panel when nothing is held, as always', () => {
    expect(onDetailsArrived(null, 'abc')).toEqual({ hold: null, open: true });
  });
});
