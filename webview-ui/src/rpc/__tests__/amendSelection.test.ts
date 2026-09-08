import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Commit, CommitDetails } from '@shared/types';
import { rpcClient } from '../rpcClient';
import { useGraphStore } from '../../stores/graphStore';

const amended: Commit = {
  hash: 'new-head', abbreviatedHash: 'new-head', parents: [],
  author: 'Author', authorEmail: 'author@example.com', authorDate: 1,
  subject: 'Amended message', refs: [{ type: 'head', name: 'main' }],
};

afterEach(() => vi.restoreAllMocks());

describe('amend selection after reload', () => {
  it.each([true, false])('refreshes commit details only if the panel was open (%s)', (open) => {
    const send = vi.spyOn(rpcClient, 'send').mockImplementation(() => {});
    useGraphStore.setState({
      detailsPanelOpen: open, commitDetails: { hash: 'old-head' } as CommitDetails,
      hasMore: false, prefetching: false,
    });
    rpcClient.selectHeadAfterNextLoad();
    rpcClient['handleMessage']({ type: 'commits', payload: { commits: [amended] } });
    expect(useGraphStore.getState().selectedCommit).toBe('new-head');
    const request = { type: 'getCommitDetails', payload: { hash: 'new-head' } };
    if (open) {
      expect(send).toHaveBeenCalledWith(request);
      expect(useGraphStore.getState().commitDetails).toBeUndefined();
    } else {
      expect(send).not.toHaveBeenCalledWith(request);
      expect(useGraphStore.getState().detailsPanelOpen).toBe(false);
    }
  });
});
