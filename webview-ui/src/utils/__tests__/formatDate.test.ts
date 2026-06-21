import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatRelativeDate,
  formatAbsoluteDateTime,
  formatAbsoluteDate,
  getDateFormatter,
} from '../formatDate';

// Build a timestamp from local-time components so the absolute formatters
// (which read getFullYear/getMonth/... in local time) assert deterministically
// regardless of the machine's timezone.
function localTs(year: number, month1: number, day: number, h = 0, m = 0): number {
  return new Date(year, month1 - 1, day, h, m).getTime();
}

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-21T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Date.now();

  it('returns "just now" under a minute', () => {
    expect(formatRelativeDate(now() - 30 * 1000)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeDate(now() - 5 * 60 * 1000)).toBe('5m ago');
  });

  it('formats hours', () => {
    expect(formatRelativeDate(now() - 3 * 60 * 60 * 1000)).toBe('3h ago');
  });

  it('formats days', () => {
    expect(formatRelativeDate(now() - 2 * 24 * 60 * 60 * 1000)).toBe('2d ago');
  });

  it('formats weeks', () => {
    expect(formatRelativeDate(now() - 14 * 24 * 60 * 60 * 1000)).toBe('2w ago');
  });

  it('formats months', () => {
    expect(formatRelativeDate(now() - 60 * 24 * 60 * 60 * 1000)).toBe('2mo ago');
  });

  it('formats years', () => {
    expect(formatRelativeDate(now() - 800 * 24 * 60 * 60 * 1000)).toBe('2y ago');
  });

  it('uses floor at boundaries (59s is still "just now")', () => {
    expect(formatRelativeDate(now() - 59 * 1000)).toBe('just now');
    expect(formatRelativeDate(now() - 60 * 1000)).toBe('1m ago');
  });
});

describe('formatAbsoluteDateTime / formatAbsoluteDate', () => {
  it('zero-pads month, day, hour, and minute', () => {
    const ts = localTs(2023, 1, 5, 9, 4);
    expect(formatAbsoluteDateTime(ts)).toBe('2023-01-05 09:04');
    expect(formatAbsoluteDate(ts)).toBe('2023-01-05');
  });

  it('renders two-digit components without extra padding', () => {
    const ts = localTs(2024, 12, 25, 23, 59);
    expect(formatAbsoluteDateTime(ts)).toBe('2024-12-25 23:59');
    expect(formatAbsoluteDate(ts)).toBe('2024-12-25');
  });
});

describe('getDateFormatter', () => {
  const ts = localTs(2023, 1, 5, 9, 4);

  it('dispatches to the absolute date-time formatter', () => {
    expect(getDateFormatter('absolute')(ts)).toBe('2023-01-05 09:04');
  });

  it('dispatches to the absolute date-only formatter', () => {
    expect(getDateFormatter('absolute-date')(ts)).toBe('2023-01-05');
  });

  it('falls back to the relative formatter for an unknown format', () => {
    // `relative` is the default branch.
    expect(getDateFormatter('relative')).toBe(formatRelativeDate);
  });

  it('memoizes the formatter for an identical (format, token) pair', () => {
    const a = getDateFormatter('custom', 'yyyy-MM-dd');
    const b = getDateFormatter('custom', 'yyyy-MM-dd');
    expect(a).toBe(b);
  });

  it('returns a different formatter when the token changes', () => {
    const a = getDateFormatter('custom', 'yyyy');
    const b = getDateFormatter('custom', 'yyyy-MM');
    expect(a).not.toBe(b);
  });

  describe('custom token', () => {
    it('formats with a valid date-fns token', () => {
      expect(getDateFormatter('custom', 'yyyy/MM/dd')(ts)).toBe('2023/01/05');
    });

    it('trims surrounding whitespace before validating the token', () => {
      expect(getDateFormatter('custom', '  yyyy-MM-dd  ')(ts)).toBe('2023-01-05');
    });

    it('falls back to relative formatting for an empty/whitespace token', () => {
      expect(getDateFormatter('custom', '   ')).toBe(formatRelativeDate);
    });

    it('falls back to relative formatting for an invalid token', () => {
      // `YYYY` is a protected week-year token; date-fns throws by default.
      expect(getDateFormatter('custom', 'YYYY')).toBe(formatRelativeDate);
    });
  });
});
