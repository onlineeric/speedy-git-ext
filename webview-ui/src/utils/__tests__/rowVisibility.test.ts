import { describe, expect, it } from 'vitest';
import { computeScrollTopForRow } from '../rowVisibility';

const ROW_HEIGHT = 28;

describe('computeScrollTopForRow', () => {
  it('returns null when the row is fully visible', () => {
    // Row 10 spans 280–308; viewport shows 200–500
    expect(
      computeScrollTopForRow({ rowIndex: 10, rowHeight: ROW_HEIGHT, scrollTop: 200, viewportHeight: 300 })
    ).toBeNull();
  });

  it('scrolls down just enough when the row is hidden below the viewport', () => {
    // Row 20 spans 560–588; viewport shows 0–400 → align row bottom to viewport bottom
    expect(
      computeScrollTopForRow({ rowIndex: 20, rowHeight: ROW_HEIGHT, scrollTop: 0, viewportHeight: 400 })
    ).toBe(588 - 400);
  });

  it('scrolls down when the row is only partially covered at the bottom', () => {
    // Row 14 spans 392–420; viewport shows 0–400 → bottom 20px are covered
    expect(
      computeScrollTopForRow({ rowIndex: 14, rowHeight: ROW_HEIGHT, scrollTop: 0, viewportHeight: 400 })
    ).toBe(420 - 400);
  });

  it('scrolls up just enough when the row is hidden above the viewport', () => {
    // Row 2 spans 56–84; viewport shows 300–600 → align row top to viewport top
    expect(
      computeScrollTopForRow({ rowIndex: 2, rowHeight: ROW_HEIGHT, scrollTop: 300, viewportHeight: 300 })
    ).toBe(56);
  });

  it('returns null when the row touches the viewport bottom edge exactly', () => {
    // Row 14 spans 392–420; viewport shows 20–420
    expect(
      computeScrollTopForRow({ rowIndex: 14, rowHeight: ROW_HEIGHT, scrollTop: 20, viewportHeight: 400 })
    ).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(
      computeScrollTopForRow({ rowIndex: -1, rowHeight: ROW_HEIGHT, scrollTop: 0, viewportHeight: 400 })
    ).toBeNull();
    expect(
      computeScrollTopForRow({ rowIndex: 5, rowHeight: 0, scrollTop: 0, viewportHeight: 400 })
    ).toBeNull();
    expect(
      computeScrollTopForRow({ rowIndex: 5, rowHeight: ROW_HEIGHT, scrollTop: 0, viewportHeight: 0 })
    ).toBeNull();
  });
});
