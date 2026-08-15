import { describe, it, expect } from 'vitest';
import {
  clampAvatarRefreshDays,
  clampBatchCommitSize,
  DEFAULT_USER_SETTINGS,
  growBatchForTarget,
  MAX_AVATAR_REFRESH_DAYS,
  MAX_BATCH_COMMIT_SIZE,
  MIN_AVATAR_REFRESH_DAYS,
} from '../../shared/types.js';

describe('growBatchForTarget', () => {
  it('uses the plain batch size when no target is given', () => {
    expect(growBatchForTarget(500, 0, undefined)).toBe(500);
    expect(growBatchForTarget(500, 1000, undefined)).toBe(500);
  });

  it('uses the plain batch size when the target is already behind the skip point', () => {
    expect(growBatchForTarget(500, 1000, 999)).toBe(500);
  });

  it('rounds a reachable target up to whole batches', () => {
    expect(growBatchForTarget(500, 0, 0)).toBe(500);
    expect(growBatchForTarget(500, 0, 499)).toBe(500);
    expect(growBatchForTarget(500, 0, 500)).toBe(1000);
    expect(growBatchForTarget(500, 1000, 1200)).toBe(500);
    expect(growBatchForTarget(500, 1000, 2200)).toBe(1500);
  });

  it('never returns less than one batch', () => {
    expect(growBatchForTarget(500, 0, 1)).toBe(500);
  });

  it('caps the grown batch at the shared ceiling', () => {
    expect(growBatchForTarget(500, 0, 5_000_000)).toBe(MAX_BATCH_COMMIT_SIZE);
  });
});

describe('clampBatchCommitSize', () => {
  it('keeps a value inside the supported range', () => {
    expect(clampBatchCommitSize(1)).toBe(1);
    expect(clampBatchCommitSize(500)).toBe(500);
    expect(clampBatchCommitSize(MAX_BATCH_COMMIT_SIZE)).toBe(MAX_BATCH_COMMIT_SIZE);
  });

  it('caps a value above the maximum', () => {
    expect(clampBatchCommitSize(20_000)).toBe(MAX_BATCH_COMMIT_SIZE);
    expect(clampBatchCommitSize(Number.MAX_SAFE_INTEGER)).toBe(MAX_BATCH_COMMIT_SIZE);
  });

  it('falls back to the default for values below 1 or non-finite', () => {
    expect(clampBatchCommitSize(0)).toBe(DEFAULT_USER_SETTINGS.batchCommitSize);
    expect(clampBatchCommitSize(-10)).toBe(DEFAULT_USER_SETTINGS.batchCommitSize);
    expect(clampBatchCommitSize(Number.NaN)).toBe(DEFAULT_USER_SETTINGS.batchCommitSize);
    expect(clampBatchCommitSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_USER_SETTINGS.batchCommitSize);
  });
});

describe('clampAvatarRefreshDays', () => {
  it('keeps a value inside the supported range', () => {
    expect(clampAvatarRefreshDays(30, 30)).toBe(30);
    expect(clampAvatarRefreshDays(MIN_AVATAR_REFRESH_DAYS, 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampAvatarRefreshDays(MAX_AVATAR_REFRESH_DAYS, 30)).toBe(MAX_AVATAR_REFRESH_DAYS);
  });

  it('clamps out-of-range values rather than rejecting them', () => {
    expect(clampAvatarRefreshDays(0, 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampAvatarRefreshDays(-5, 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampAvatarRefreshDays(10_000, 30)).toBe(MAX_AVATAR_REFRESH_DAYS);
  });

  it('falls back for non-finite input', () => {
    expect(clampAvatarRefreshDays(Number.NaN, 30)).toBe(30);
    expect(clampAvatarRefreshDays(Number.POSITIVE_INFINITY, 30)).toBe(30);
  });

  it('rounds a fractional number to whole days', () => {
    expect(clampAvatarRefreshDays(7.4, 30)).toBe(7);
    expect(clampAvatarRefreshDays(7.6, 30)).toBe(8);
  });

  // The settings input hands over its raw text, so the string form is the one
  // the UI actually exercises.
  it('parses the raw text of the settings input', () => {
    expect(clampAvatarRefreshDays('30', 30)).toBe(30);
    expect(clampAvatarRefreshDays('  14  ', 30)).toBe(14);
    expect(clampAvatarRefreshDays('0', 30)).toBe(MIN_AVATAR_REFRESH_DAYS);
    expect(clampAvatarRefreshDays('9999', 30)).toBe(MAX_AVATAR_REFRESH_DAYS);
    expect(clampAvatarRefreshDays('7.9', 30)).toBe(7);
  });

  it('falls back to the current setting when the box is empty or unparseable', () => {
    // Clearing the field must not be read as "refresh every 0 days".
    expect(clampAvatarRefreshDays('', 30)).toBe(30);
    expect(clampAvatarRefreshDays('   ', 45)).toBe(45);
    expect(clampAvatarRefreshDays('abc', 30)).toBe(30);
  });
});
