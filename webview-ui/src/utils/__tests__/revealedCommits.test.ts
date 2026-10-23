import { describe, it, expect } from 'vitest';
import type { Commit } from '@shared/types';
import { mergeRevealedExtraCommits } from '../revealedCommits';

function commit(hash: string, authorDate: number, parents: string[] = []): Commit {
  return { hash, abbreviatedHash: hash, parents, author: 'A', authorEmail: 'a@x', authorDate, subject: hash, refs: [] };
}

const loaded = [commit('d', 40, ['c']), commit('c', 30, ['b']), commit('b', 20, ['a'])];
const hashesOf = (commits: readonly Commit[]) => commits.map((c) => c.hash);

describe('mergeRevealedExtraCommits', () => {
  it('returns the loaded array itself when there are no extras', () => {
    const extras: Commit[] = [];
    const result = mergeRevealedExtraCommits(loaded, extras);
    expect(result.commits).toBe(loaded);
    expect(result.unloadedExtras).toBe(extras);
  });

  it('places a parent older than the whole stream at the bottom', () => {
    expect(hashesOf(mergeRevealedExtraCommits(loaded, [commit('a', 10)]).commits)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('places an extra at its date position, ties after', () => {
    expect(hashesOf(mergeRevealedExtraCommits(loaded, [commit('x', 30)]).commits)).toEqual(['d', 'c', 'x', 'b']);
  });

  it('never places an extra above a loaded commit that lists it as a parent', () => {
    // Newer than `d` by date, but `c` is its child.
    const result = mergeRevealedExtraCommits(loaded, [commit('p', 99)]);
    const withChild = mergeRevealedExtraCommits([commit('d', 40, ['c']), commit('c', 30, ['p'])], [commit('p', 99)]);
    expect(hashesOf(result.commits)).toEqual(['p', 'd', 'c', 'b']);
    expect(hashesOf(withChild.commits)).toEqual(['d', 'c', 'p']);
  });

  it('never places an extra below one of its own loaded parents', () => {
    // Older than everything by date, but `c` is its parent.
    expect(hashesOf(mergeRevealedExtraCommits(loaded, [commit('h', 1, ['c'])]).commits)).toEqual(['d', 'h', 'c', 'b']);
  });

  it('skips an extra that has since been loaded and reports it as no longer unloaded', () => {
    const extras = [commit('c', 30), commit('a', 10)];
    const result = mergeRevealedExtraCommits(loaded, extras);
    expect(hashesOf(result.commits)).toEqual(['d', 'c', 'b', 'a']);
    expect(hashesOf(result.unloadedExtras)).toEqual(['a']);
  });

  it('keeps the extras array identity while none became loaded', () => {
    const extras = [commit('a', 10)];
    expect(mergeRevealedExtraCommits(loaded, extras).unloadedExtras).toBe(extras);
  });
});
