import { describe, it, expect } from 'vitest';
import { buildDefaultStashMessage } from '../stashMessage';

describe('buildDefaultStashMessage', () => {
  it('formats with multi-file count and simple branch name', () => {
    expect(buildDefaultStashMessage(5, 'dev')).toBe('Stash of 5 files from dev');
  });

  it('formats with single-file count (literal plural is intentional per spec FR-032)', () => {
    expect(buildDefaultStashMessage(1, 'feature/x')).toBe('Stash of 1 files from feature/x');
  });

  it('handles zero-count edge case', () => {
    expect(buildDefaultStashMessage(0, 'main')).toBe('Stash of 0 files from main');
  });

  it('preserves branch names with slashes and dashes', () => {
    expect(buildDefaultStashMessage(3, 'feature/038-uncommitted-node-ux')).toBe(
      'Stash of 3 files from feature/038-uncommitted-node-ux',
    );
  });
});
