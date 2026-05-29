import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graphStore';
import type { Commit, WorktreeInfo } from '@shared/types';
import type { InitialDataPayload } from '@shared/messages';

const makeWorktree = (path: string, head: string, overrides: Partial<WorktreeInfo> = {}): WorktreeInfo => ({
  path,
  head,
  branch: `refs/heads/${path.split('/').pop()}`,
  isMain: false,
  isDetached: false,
  isCurrent: false,
  isPrunable: false,
  ...overrides,
});

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

const makeInitialDataPayload = (commits: Commit[]): InitialDataPayload => ({
  commits,
  totalLoadedWithoutFilter: commits.length,
  hasMore: false,
  branches: [],
  stashes: [],
  uncommittedChanges: {
    stagedFiles: [],
    unstagedFiles: [],
    conflictFiles: [],
    stagedCount: 0,
    unstagedCount: 0,
    untrackedCount: 0,
  },
  remotes: [],
  authors: [],
  worktrees: [],
  cherryPickState: 'idle',
  rebaseState: 'idle',
  rebaseConflictInfo: null,
  revertState: 'idle',
  errors: [],
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

describe('graphStore — setInitialData', () => {
  beforeEach(() => {
    useGraphStore.setState({
      commits: [],
      branches: [],
      loading: true,
      isRefreshing: true,
    });
  });

  it('clears loading when initial data arrives', () => {
    useGraphStore.getState().setInitialData(makeInitialDataPayload([makeCommit('abc1234')]));

    expect(useGraphStore.getState().loading).toBe(false);
    expect(useGraphStore.getState().isRefreshing).toBe(false);
  });
});

describe('graphStore — setWorktreeList (array-valued worktreeByHead)', () => {
  it('keeps both worktrees that share the same HEAD commit', () => {
    const head = 'aaaa1111';
    useGraphStore.getState().setWorktreeList([
      makeWorktree('/wt/feature-a', head, { branch: 'refs/heads/feature-a' }),
      makeWorktree('/wt/feature-b', head, { branch: 'refs/heads/feature-b' }),
    ]);

    const entries = useGraphStore.getState().worktreeByHead.get(head);
    expect(entries).toHaveLength(2);
    expect(entries?.map((w) => w.path)).toEqual(['/wt/feature-a', '/wt/feature-b']);
  });

  it('groups worktrees by distinct HEAD', () => {
    useGraphStore.getState().setWorktreeList([
      makeWorktree('/wt/one', 'hash1'),
      makeWorktree('/wt/two', 'hash2'),
    ]);
    const byHead = useGraphStore.getState().worktreeByHead;
    expect(byHead.get('hash1')).toHaveLength(1);
    expect(byHead.get('hash2')).toHaveLength(1);
  });
});

describe('graphStore — toggleSelectedCommit', () => {
  beforeEach(() => {
    useGraphStore.setState({
      selectedCommit: undefined,
      selectedCommitIndex: -1,
      selectedCommits: [],
      lastClickedHash: undefined,
    });
  });

  it('seeds the multi-selection with the single-click anchor when Ctrl+clicking a different row', () => {
    // User clicks A → selectedCommit set, selectedCommits empty (matches selectCommit action).
    useGraphStore.setState({ selectedCommit: 'A', selectedCommits: [], lastClickedHash: 'A' });

    // User Ctrl+clicks B.
    useGraphStore.getState().toggleSelectedCommit('B');

    // Both A (the original anchor) and B should be in the multi-selection.
    expect(useGraphStore.getState().selectedCommits).toEqual(['A', 'B']);
    expect(useGraphStore.getState().lastClickedHash).toBe('B');
  });

  it('does not duplicate the anchor when Ctrl+clicking the same row that was single-clicked', () => {
    useGraphStore.setState({ selectedCommit: 'A', selectedCommits: [], lastClickedHash: 'A' });

    useGraphStore.getState().toggleSelectedCommit('A');

    // No seeding needed; toggling A on an empty list adds A once.
    expect(useGraphStore.getState().selectedCommits).toEqual(['A']);
  });

  it('does not seed when there is no single-click anchor', () => {
    useGraphStore.setState({ selectedCommit: undefined, selectedCommits: [], lastClickedHash: undefined });

    useGraphStore.getState().toggleSelectedCommit('B');

    expect(useGraphStore.getState().selectedCommits).toEqual(['B']);
  });

  it('does not re-seed once the multi-selection is already populated', () => {
    useGraphStore.setState({ selectedCommit: 'A', selectedCommits: ['A', 'B'], lastClickedHash: 'B' });

    // Toggling C should append it without re-seeding.
    useGraphStore.getState().toggleSelectedCommit('C');
    expect(useGraphStore.getState().selectedCommits).toEqual(['A', 'B', 'C']);

    // Toggling B again should remove it.
    useGraphStore.getState().toggleSelectedCommit('B');
    expect(useGraphStore.getState().selectedCommits).toEqual(['A', 'C']);
  });
});
