import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graphStore';
import type { Commit } from '@shared/types';

const makeCommit = (hash: string): Commit => ({
  hash,
  abbreviatedHash: hash.slice(0, 7),
  parents: [],
  author: 'Test User',
  authorEmail: 'test@example.com',
  authorDate: 1000000,
  subject: `Commit ${hash}`,
  refs: [],
});

describe('graphStore — setCommits', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    useGraphStore.setState({
      commits: [],
      totalLoadedWithoutFilter: null,
    });
  });

  it('resets totalLoadedWithoutFilter to null on every setCommits call when it was null', () => {
    useGraphStore.getState().setCommits([makeCommit('abc1234')]);
    expect(useGraphStore.getState().totalLoadedWithoutFilter).toBeNull();
  });

  it('resets totalLoadedWithoutFilter to null on every setCommits call when it had a previous value', () => {
    // Set a non-null value first (simulating what happens after loadMoreCommits)
    useGraphStore.setState({ totalLoadedWithoutFilter: 42 });
    expect(useGraphStore.getState().totalLoadedWithoutFilter).toBe(42);

    // setCommits should unconditionally reset to null
    useGraphStore.getState().setCommits([makeCommit('def5678')]);
    expect(useGraphStore.getState().totalLoadedWithoutFilter).toBeNull();
  });

  it('resets totalLoadedWithoutFilter even when called with an empty commits array', () => {
    useGraphStore.setState({ totalLoadedWithoutFilter: 100 });
    useGraphStore.getState().setCommits([]);
    expect(useGraphStore.getState().totalLoadedWithoutFilter).toBeNull();
  });
});
