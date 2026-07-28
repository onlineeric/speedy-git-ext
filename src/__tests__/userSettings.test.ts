import { describe, it, expect } from 'vitest';
import { clampBatchCommitSize, DEFAULT_USER_SETTINGS, MAX_BATCH_COMMIT_SIZE } from '../../shared/types.js';

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
