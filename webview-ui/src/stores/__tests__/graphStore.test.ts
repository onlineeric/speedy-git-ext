import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graphStore';
import type { Commit, FileChange, RemoteInfo, StashEntry, WorktreeInfo } from '@shared/types';
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
      remotes: [],
      stashes: [],
      worktreeList: [],
      worktreeByHead: new Map(),
      uncommittedStagedFiles: [],
      uncommittedUnstagedFiles: [],
      uncommittedConflictFiles: [],
      uncommittedCounts: { stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
      hasUncommittedChanges: false,
      loading: true,
      isRefreshing: true,
    });
  });

  it('clears loading when initial data arrives', () => {
    useGraphStore.getState().setInitialData(makeInitialDataPayload([makeCommit('abc1234')]));

    expect(useGraphStore.getState().loading).toBe(false);
    expect(useGraphStore.getState().isRefreshing).toBe(false);
  });

  it('retains already-hydrated deferred data when a fast initial payload omits it', () => {
    const stagedFile: FileChange = { path: 'src/file.ts', status: 'modified', stageState: 'staged' };
    const remote: RemoteInfo = { name: 'origin', fetchUrl: 'git@example.com/repo.git', pushUrl: 'git@example.com/repo.git' };
    const stash: StashEntry = {
      index: 0,
      hash: 'stash000',
      parentHash: 'abc1234',
      message: 'WIP',
      date: 1,
      author: 'Test User',
      authorEmail: 'test@example.com',
    };
    const worktree: WorktreeInfo = {
      path: '/repo-wt',
      head: 'abc1234',
      branch: 'feature',
      isMain: false,
      isDetached: false,
    };

    useGraphStore.setState({
      remotes: [remote],
      stashes: [stash],
      worktreeList: [worktree],
      worktreeByHead: new Map([[worktree.head, worktree]]),
      uncommittedStagedFiles: [stagedFile],
      uncommittedCounts: { stagedCount: 1, unstagedCount: 0, untrackedCount: 0 },
      hasUncommittedChanges: true,
    });

    useGraphStore.getState().setInitialData(makeInitialDataPayload([makeCommit('abc1234')]));

    const after = useGraphStore.getState();
    expect(after.remotes).toEqual([remote]);
    expect(after.stashes).toEqual([stash]);
    expect(after.worktreeList).toEqual([worktree]);
    expect(after.worktreeByHead.get('abc1234')).toEqual(worktree);
    expect(after.uncommittedStagedFiles).toEqual([stagedFile]);
    expect(after.uncommittedCounts.stagedCount).toBe(1);
    expect(after.hasUncommittedChanges).toBe(true);
  });

  it('clears deferred repo data when the active parent repo changes', () => {
    useGraphStore.setState({
      activeParentRepoPath: '/old',
      authorList: [{ name: 'Old Author', email: 'old@example.com' }],
      authorListLoading: true,
      remotes: [{ name: 'origin', fetchUrl: 'old', pushUrl: 'old' }],
      stashes: [{
        index: 0,
        hash: 'stash000',
        parentHash: 'abc1234',
        message: 'WIP',
        date: 1,
        author: 'Test User',
        authorEmail: 'test@example.com',
      }],
      worktreeList: [{ path: '/old-wt', head: 'abc1234', branch: 'main', isMain: false, isDetached: false }],
      worktreeByHead: new Map([['abc1234', { path: '/old-wt', head: 'abc1234', branch: 'main', isMain: false, isDetached: false }]]),
      uncommittedStagedFiles: [{ path: 'src/file.ts', status: 'modified', stageState: 'staged' }],
      uncommittedCounts: { stagedCount: 1, unstagedCount: 0, untrackedCount: 0 },
      hasUncommittedChanges: true,
    });

    useGraphStore.getState().setRepos(
      [{ path: '/new', name: 'new', displayName: 'new' }],
      '/new',
    );

    const after = useGraphStore.getState();
    expect(after.authorList).toEqual([]);
    expect(after.authorListLoading).toBe(false);
    expect(after.remotes).toEqual([]);
    expect(after.stashes).toEqual([]);
    expect(after.worktreeList).toEqual([]);
    expect(after.worktreeByHead.size).toBe(0);
    expect(after.uncommittedStagedFiles).toEqual([]);
    expect(after.uncommittedCounts.stagedCount).toBe(0);
    expect(after.hasUncommittedChanges).toBe(false);
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
      signaturePresenceLoading: {},
      signaturePresenceFailed: {},
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

  it('clears presence loading/failed guards when presence results arrive', () => {
    useGraphStore.setState({
      signaturePresenceLoading: { aaaaaaa: true },
      signaturePresenceFailed: { aaaaaaa: true },
      signaturePresence: {},
    });

    useGraphStore.getState().mergeSignaturePresence({ aaaaaaa: 'signed' });

    const after = useGraphStore.getState();
    expect(after.signaturePresence['aaaaaaa']).toBe('signed');
    expect(after.signaturePresenceLoading['aaaaaaa']).toBeUndefined();
    expect(after.signaturePresenceFailed['aaaaaaa']).toBeUndefined();
  });

  it('marks failed presence requests without leaving them in flight', () => {
    useGraphStore.setState({
      signaturePresenceLoading: { aaaaaaa: true },
      signaturePresenceFailed: {},
    });

    useGraphStore.getState().markSignaturePresenceFailed(['aaaaaaa']);

    const after = useGraphStore.getState();
    expect(after.signaturePresenceLoading['aaaaaaa']).toBeUndefined();
    expect(after.signaturePresenceFailed['aaaaaaa']).toBe(true);
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
