import { describe, it, expect } from 'vitest';
import { describeRefMoved, isRefMoved } from '../../shared/refRevalidation.js';

const expectation = { ref: 'main', expectedHash: 'a'.repeat(40) };

describe('isRefMoved', () => {
  it('is false when the ref still points where the dialog saw it', () => {
    expect(isRefMoved(expectation, 'a'.repeat(40))).toBe(false);
  });

  it('is true when the ref moved', () => {
    expect(isRefMoved(expectation, 'b'.repeat(40))).toBe(true);
  });

  it('is true when the ref can no longer be resolved', () => {
    expect(isRefMoved(expectation, null)).toBe(true);
  });

  it('compares full hashes, so a shared prefix is still a move', () => {
    expect(isRefMoved(expectation, 'a'.repeat(39) + 'b')).toBe(true);
  });
});

describe('describeRefMoved', () => {
  it('says the ref changed and that nothing was done', () => {
    const message = describeRefMoved('main', 'b'.repeat(40));
    expect(message).toContain('`main` changed since you opened this dialog');
    expect(message).toContain('Nothing was done');
    expect(message).toContain('reopen the dialog');
  });

  it('says the ref no longer exists when it is gone', () => {
    const message = describeRefMoved('origin/main', null);
    expect(message).toBe('`origin/main` no longer exists. Nothing was done.');
  });
});
