import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InitialDataPayload } from '@shared/messages';
import { rpcClient } from '../rpcClient';
import { useGraphStore } from '../../stores/graphStore';

const initialData = (): InitialDataPayload => ({
  commits: [],
  totalLoadedWithoutFilter: 0,
  hasMore: false,
  branches: [],
  stashes: [],
  uncommittedChanges: { stagedFiles: [], unstagedFiles: [], conflictFiles: [], stagedCount: 0, unstagedCount: 0, untrackedCount: 0 },
  remotes: [],
  authors: [],
  worktrees: [],
  cherryPickState: 'idle',
  rebaseState: 'idle',
  rebaseConflictInfo: null,
  revertState: 'idle',
  mergeState: 'idle',
  errors: [],
});

let sent: Array<{ type: string; payload: Record<string, unknown> }>;
const authorRequests = () => sent.filter((m) => m.type === 'getAuthors').map((m) => m.payload.repoPath);

beforeEach(() => {
  sent = [];
  vi.spyOn(rpcClient, 'send').mockImplementation((message) => { sent.push(message as never); });
  useGraphStore.setState({ authorListsByRepo: new Map(), authorListLoadingRepos: new Set(), displayedRepoPath: '/repo' });
});

afterEach(() => vi.restoreAllMocks());

describe('author list prefetch', () => {
  it('prefetches when a repo first loads, and after switching to a repo or submodule not yet scanned', () => {
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual(['/repo']);

    useGraphStore.setState({ displayedRepoPath: '/repo/repo-a' });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual(['/repo', '/repo/repo-a']);
  });

  it('does not prefetch a repo already scanned this session', () => {
    useGraphStore.getState().setRepoAuthorList('/repo', { authors: [], currentUserEmail: null });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual([]);
  });

  it('retries after a refused scan once the repo has loaded', () => {
    rpcClient.refreshAuthors();
    rpcClient['handleMessage']({ type: 'authorListFailed', payload: { repoPath: '/repo' } });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual(['/repo', '/repo']);
  });
});
