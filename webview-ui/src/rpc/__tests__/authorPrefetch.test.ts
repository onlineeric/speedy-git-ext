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
const emailRequests = () => sent.filter((m) => m.type === 'getCurrentUserEmail').map((m) => m.payload.repoPath);

beforeEach(() => {
  sent = [];
  vi.spyOn(rpcClient, 'send').mockImplementation((message) => { sent.push(message as never); });
  useGraphStore.setState({ authorScansByRepo: new Map(), userEmailByRepo: new Map(), displayedRepoPath: '/repo' });
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

  it('prefetches once the re-sent repo list arrives, when the first one was lost (#221)', () => {
    // A lost first `repoList` leaves the displayed repo unknown, so nothing can be scanned.
    useGraphStore.setState({ activeParentRepoPath: '', displayedRepoPath: '' });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual([]);

    // The backend re-sends it just ahead of the first `initialData`.
    rpcClient['handleMessage']({ type: 'repoList', payload: { repos: [], activeRepoPath: '/repo' } });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual(['/repo']);
  });

  it('does not prefetch a repo already scanned this session', () => {
    useGraphStore.getState().setRepoAuthorList('/repo', []);
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual([]);
  });

  it('stops prefetching a repo whose scan git failed, and only reports it while the panel is open', () => {
    useGraphStore.setState({ displayedRepoPath: '/broken', activeToggleWidget: null, error: undefined });
    rpcClient.refreshAuthors();
    rpcClient['handleMessage']({ type: 'authorListFailed', payload: { repoPath: '/broken', error: { message: 'timed out' } } });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });

    expect(authorRequests()).toEqual(['/broken']);
    expect(useGraphStore.getState().error).toBeUndefined();

    useGraphStore.setState({ activeToggleWidget: 'filter' });
    rpcClient.refreshAuthors();
    rpcClient['handleMessage']({ type: 'authorListFailed', payload: { repoPath: '/broken', error: { message: 'timed out' } } });

    expect(authorRequests()).toEqual(['/broken', '/broken']);
    expect(useGraphStore.getState().error).toBe('timed out');
  });

  it('retries after a refused scan once the repo has loaded', () => {
    rpcClient.refreshAuthors();
    rpcClient['handleMessage']({ type: 'authorListFailed', payload: { repoPath: '/repo' } });
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(authorRequests()).toEqual(['/repo', '/repo']);
  });

  it('reads user.email ahead of, and apart from, the author scan, once per repo', () => {
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(sent.map((m) => m.type).filter((t) => t === 'getCurrentUserEmail' || t === 'getAuthors'))
      .toEqual(['getCurrentUserEmail', 'getAuthors']);

    rpcClient['handleMessage']({ type: 'currentUserEmail', payload: { repoPath: '/repo', email: 'me@x' } });
    expect(useGraphStore.getState().userEmailByRepo.get('/repo')).toBe('me@x');

    // A later page load does not read it again; a Filter panel open does.
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(emailRequests()).toEqual(['/repo']);
    rpcClient.refreshCurrentUserEmail();
    expect(emailRequests()).toEqual(['/repo', '/repo']);
  });

  it('reads user.email for a repo whose author scan failed', () => {
    useGraphStore.getState().endAuthorListLoad('/repo', true);
    rpcClient['handleMessage']({ type: 'initialData', payload: initialData() });
    expect(emailRequests()).toEqual(['/repo']);
    expect(authorRequests()).toEqual([]);
  });
});
