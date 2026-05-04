import { describe, it, expect } from 'vitest';
import { validateFilePath, validateHash, validateRefName } from '../utils/gitValidation.js';

describe('validateHash', () => {
  it('accepts a 40-char SHA1 hash', () => {
    const result = validateHash('abcdef1234567890abcdef1234567890abcdef12');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBe('abcdef1234567890abcdef1234567890abcdef12');
  });

  it('accepts a short 7-char hash', () => {
    expect(validateHash('abc1234').success).toBe(true);
  });

  it('accepts the minimum 4-char hash', () => {
    expect(validateHash('abcd').success).toBe(true);
  });

  it('accepts hashes with ~N parent suffix', () => {
    expect(validateHash('abc1234~1').success).toBe(true);
    expect(validateHash('abc1234~10').success).toBe(true);
  });

  it('accepts uppercase hashes', () => {
    expect(validateHash('ABCDEF12').success).toBe(true);
  });

  it('rejects hashes shorter than 4 chars', () => {
    expect(validateHash('abc').success).toBe(false);
  });

  it('rejects hashes longer than 40 chars (without suffix)', () => {
    expect(validateHash('a'.repeat(41)).success).toBe(false);
  });

  it('rejects empty input', () => {
    expect(validateHash('').success).toBe(false);
  });

  it('rejects values with non-hex characters', () => {
    expect(validateHash('xyz12345').success).toBe(false);
    expect(validateHash('abc1234!').success).toBe(false);
    expect(validateHash('main').success).toBe(false);
  });

  it('returns VALIDATION_ERROR code on failure', () => {
    const result = validateHash('not-a-hash');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('validateRefName', () => {
  it('accepts ordinary branch names', () => {
    expect(validateRefName('main').success).toBe(true);
    expect(validateRefName('feature/login').success).toBe(true);
    expect(validateRefName('release-1.0').success).toBe(true);
  });

  it('rejects names starting with a dash to prevent flag injection', () => {
    expect(validateRefName('-D').success).toBe(false);
    expect(validateRefName('--force').success).toBe(false);
  });

  it('rejects empty names', () => {
    expect(validateRefName('').success).toBe(false);
  });

  it('returns VALIDATION_ERROR code on failure', () => {
    const result = validateRefName('-x');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('validateFilePath', () => {
  it('accepts ordinary paths', () => {
    expect(validateFilePath('src/index.ts').success).toBe(true);
    expect(validateFilePath('./README.md').success).toBe(true);
  });

  it('rejects paths starting with a dash', () => {
    expect(validateFilePath('--all').success).toBe(false);
  });

  it('rejects empty paths', () => {
    expect(validateFilePath('').success).toBe(false);
  });
});
