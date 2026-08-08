import { describe, expect, it } from 'vitest';
import {
  MAX_AVATAR_REFRESH_DAYS,
  MIN_AVATAR_REFRESH_DAYS,
  clampRefreshDaysInput,
} from '../avatarSettings';

describe('clampRefreshDaysInput', () => {
  it('accepts a plain in-range number', () => {
    expect(clampRefreshDaysInput('30', 30)).toBe(30);
    expect(clampRefreshDaysInput('7', 30)).toBe(7);
  });

  it('tolerates surrounding whitespace', () => {
    expect(clampRefreshDaysInput('  14  ', 30)).toBe(14);
  });

  it('clamps to the supported range rather than rejecting', () => {
    expect(clampRefreshDaysInput('0', 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampRefreshDaysInput('-3', 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampRefreshDaysInput('9999', 30)).toBe(MAX_AVATAR_REFRESH_DAYS);
  });

  it('falls back to the current setting when the box is empty or unparseable', () => {
    // Clearing the field must not be read as "refresh every 0 days".
    expect(clampRefreshDaysInput('', 30)).toBe(30);
    expect(clampRefreshDaysInput('   ', 45)).toBe(45);
    expect(clampRefreshDaysInput('abc', 30)).toBe(30);
  });

  it('truncates a fractional entry to whole days', () => {
    expect(clampRefreshDaysInput('7.9', 30)).toBe(7);
  });
});
