import { describe, it, expect } from 'vitest';
import type { Branch } from '@shared/types';
import { resolveDefaultRemote } from '../resolveDefaultRemote';

function b(name: string, remote?: string): Branch {
  return { name, remote, current: false, hash: '0'.repeat(40) };
}

describe('resolveDefaultRemote', () => {
  it('returns "origin" when origin is the only remote', () => {
    expect(resolveDefaultRemote([
      b('main'),
      b('main', 'origin'),
      b('feature-x', 'origin'),
    ])).toBe('origin');
  });

  it('prefers "origin" over other remotes when both are present', () => {
    expect(resolveDefaultRemote([
      b('main', 'origin'),
      b('main', 'upstream'),
    ])).toBe('origin');
  });

  it('returns the alphabetically-first remote when origin is absent', () => {
    expect(resolveDefaultRemote([
      b('main', 'upstream'),
      b('main', 'fork'),
    ])).toBe('fork');
  });

  it('returns literal "origin" when no remotes are loaded', () => {
    expect(resolveDefaultRemote([
      b('main'),
      b('feature-x'),
    ])).toBe('origin');
  });

  it('returns literal "origin" for an empty branch list', () => {
    expect(resolveDefaultRemote([])).toBe('origin');
  });

  it('deduplicates remote names when multiple branches share a remote', () => {
    expect(resolveDefaultRemote([
      b('main', 'fork'),
      b('feature-x', 'fork'),
      b('release', 'fork'),
    ])).toBe('fork');
  });
});
