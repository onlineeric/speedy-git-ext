import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graphStore';
import type { Commit } from '@shared/types';
import type { InitialDataPayload } from '@shared/messages';

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

describe('graphStore — signature cache retention on refresh (FR-015)', () => {
  const verified = { status: 'verified', signer: '', keyId: '', fingerprint: '', format: 'gpg' } as const;

  beforeEach(() => {
    useGraphStore.setState({
      commits: [],
      signatureCache: {},
      signatureLoading: {},
      signaturePresence: {},
    });
  });

  it('setCommits retains cached verdicts/presence for commits still loaded and prunes the rest', () => {
    useGraphStore.getState().setCommits([makeCommit('aaaaaaa'), makeCommit('bbbbbbb')]);
    // Simulate the async loader having verified both commits.
    useGraphStore.setState({
      signatureCache: { aaaaaaa: { ...verified }, bbbbbbb: null },
      signaturePresence: { aaaaaaa: 'signed', bbbbbbb: 'not-signed' },
    });

    // Refresh: bbbbbbb disappears, ccccccc is new.
    useGraphStore.getState().setCommits([makeCommit('aaaaaaa'), makeCommit('ccccccc')]);

    const after = useGraphStore.getState();
    expect(after.signatureCache['aaaaaaa']?.status).toBe('verified'); // retained, no re-verify
    expect(after.signaturePresence['aaaaaaa']).toBe('signed');        // retained
    expect('bbbbbbb' in after.signatureCache).toBe(false);            // gone → pruned
    expect('bbbbbbb' in after.signaturePresence).toBe(false);
    expect('ccccccc' in after.signatureCache).toBe(false);           // new → verified later
  });

  it('setInitialData retains cached signatures by hash across a refresh', () => {
    useGraphStore.getState().setInitialData(
      makeInitialDataPayload([makeCommit('aaaaaaa'), makeCommit('bbbbbbb')])
    );
    useGraphStore.setState({
      signatureCache: { aaaaaaa: { ...verified } },
      signaturePresence: { aaaaaaa: 'signed', bbbbbbb: 'not-signed' },
    });

    useGraphStore.getState().setInitialData(makeInitialDataPayload([makeCommit('aaaaaaa')]));

    const after = useGraphStore.getState();
    expect(after.signatureCache['aaaaaaa']?.status).toBe('verified');
    expect(after.signaturePresence['aaaaaaa']).toBe('signed');
    expect('bbbbbbb' in after.signaturePresence).toBe(false); // pruned
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
