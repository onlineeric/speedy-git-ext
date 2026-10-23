import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Commit } from '@shared/types';
import { rpcClient } from '../rpcClient';
import { useGraphStore } from '../../stores/graphStore';
import { COMMIT_NAVIGATION_MESSAGES } from '../../utils/headNavigation';

const commit = (hash: string, authorEmail = 'me@example.com', parents: string[] = []): Commit => ({
  hash, abbreviatedHash: hash, parents, author: 'A', authorEmail, authorDate: 10, subject: hash, refs: [],
});

let sent: Array<{ type: string; payload: Record<string, unknown> }>;

beforeEach(() => {
  sent = [];
  vi.spyOn(rpcClient, 'send').mockImplementation((message) => { sent.push(message as never); });
  useGraphStore.setState({ loading: false, detailsPanelOpen: false, hasMore: false, prefetching: false, filters: { maxCount: 500 } });
  useGraphStore.getState().clearRevealedCommits();
  useGraphStore.getState().setCommits([commit('child', 'me@example.com', ['parent']), commit('parent', 'other@example.com')]);
  useGraphStore.getState().setFilters({ authors: ['me@example.com'] });
  useGraphStore.getState().recomputeVisibility();
});

afterEach(() => vi.restoreAllMocks());

const lastByHashRequest = () => sent.filter((m) => m.type === 'getCommitsByHash').at(-1)!.payload as { requestId: number; hashes: string[] };

describe('Go to — reveal filtered-out targets (GH #214)', () => {
  it('reveals a parent hidden by the Author filter and lands on it', () => {
    rpcClient.goToRelatedCommit('parent', 'parent');

    const state = useGraphStore.getState();
    expect(state.selectedCommit).toBe('parent');
    expect(state.filterKeptCommitHashes.has('parent')).toBe(true);
    expect(state.goToHeadState).toBe('idle');
  });

  it('fetches a target outside the filtered stream and lands on it', () => {
    useGraphStore.setState({ goToHeadState: 'locating', navigationTarget: 'parent' });
    rpcClient['handleMessage']({ type: 'headLocation', payload: { hash: 'old', index: -1 } });
    expect(useGraphStore.getState().goToHeadState).toBe('loading');
    const { requestId, hashes } = lastByHashRequest();
    expect(hashes).toEqual(['old']);

    rpcClient['handleMessage']({ type: 'commitsByHash', payload: { requestId, commits: [commit('old', 'other@example.com')] } });

    const state = useGraphStore.getState();
    expect(state.selectedCommit).toBe('old');
    expect(state.mergedCommits.at(-1)?.hash).toBe('old');
    expect(state.goToHeadState).toBe('idle');
  });

  it('drops a fetch reply that outlived a filter change', () => {
    useGraphStore.setState({ goToHeadState: 'locating', navigationTarget: 'head' });
    rpcClient['handleMessage']({ type: 'headLocation', payload: { hash: 'old', index: -1 } });
    const { requestId } = lastByHashRequest();

    useGraphStore.getState().setFilters({ textFilter: 'x' });
    rpcClient['handleMessage']({ type: 'commitsByHash', payload: { requestId, commits: [commit('old')] } });

    const state = useGraphStore.getState();
    expect(state.revealedExtraCommits).toEqual([]);
    expect(state.goToHeadState).toBe('idle');
    expect(state.error).toBeUndefined();
  });

  it('drops a fetch reply whose navigation a refresh ended, even while a newer one runs', () => {
    useGraphStore.setState({ goToHeadState: 'locating', navigationTarget: 'parent' });
    rpcClient['handleMessage']({ type: 'headLocation', payload: { hash: 'old', index: -1 } });
    const { requestId } = lastByHashRequest();

    rpcClient['handleMessage']({ type: 'commits', payload: { commits: useGraphStore.getState().commits } });
    rpcClient.goToHead();
    rpcClient['handleMessage']({ type: 'commitsByHash', payload: { requestId, commits: [commit('old')] } });

    const state = useGraphStore.getState();
    expect(state.goToHeadState).toBe('locating');
    expect(state.selectedCommit).not.toBe('old');
    expect(state.revealedExtraCommits).toEqual([]);
  });

  it('keeps the generic toast when the fetched commit no longer exists', () => {
    useGraphStore.setState({ goToHeadState: 'locating', navigationTarget: 'child', error: undefined });
    rpcClient['handleMessage']({ type: 'headLocation', payload: { hash: 'old', index: -1 } });

    rpcClient['handleMessage']({ type: 'commitsByHash', payload: { requestId: lastByHashRequest().requestId, commits: [] } });

    expect(useGraphStore.getState().error).toBe(COMMIT_NAVIGATION_MESSAGES.child.notInView);
  });

  it('re-reads revealed extras after a refresh', () => {
    useGraphStore.getState().addRevealedExtraCommit(commit('old'));

    rpcClient['handleMessage']({ type: 'commits', payload: { commits: useGraphStore.getState().commits } });

    expect(lastByHashRequest().hashes).toEqual(['old']);
  });

  it('keeps an extra revealed while a refresh re-read was in flight', () => {
    useGraphStore.getState().addRevealedExtraCommit(commit('old'));
    rpcClient['handleMessage']({ type: 'commits', payload: { commits: useGraphStore.getState().commits } });
    const revalidateId = lastByHashRequest().requestId;

    useGraphStore.getState().addRevealedExtraCommit(commit('newer'));
    rpcClient['handleMessage']({ type: 'commitsByHash', payload: { requestId: revalidateId, commits: [commit('old')] } });

    expect(useGraphStore.getState().revealedExtraCommits.map((c) => c.hash).sort()).toEqual(['newer', 'old']);
  });
});
