import { describe, expect, it, vi } from 'vitest';
import { graphDataHandlers } from '../webview/handlers/graphDataHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import type { GitLogService } from '../services/GitLogService.js';
import { ok, err, GitError } from '../../shared/errors.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(() => Promise.resolve(undefined)) },
}));

interface LogServiceMock {
  getHeadCommitHash: ReturnType<typeof vi.fn>;
  getCommitPosition: ReturnType<typeof vi.fn>;
  getContainingBranches: ReturnType<typeof vi.fn>;
}

function makeContext(gitLogService: Partial<LogServiceMock> = {}) {
  const postMessage = vi.fn();
  const context = {
    services: { current: () => ({ gitLogService }) },
    postMessage,
    runtime: { currentRepoPath: '/repo' },
    log: {},
  } as unknown as WebviewRequestContext;
  return { context, postMessage };
}

function locateHeadMessage(displayedHeadHash: string | null) {
  return { type: 'locateHead' as const, payload: { filters: {}, displayedHeadHash } };
}

describe('graphDataHandlers.locateHead', () => {
  it('confirms a displayed HEAD without walking the log', async () => {
    const gitLogService: Partial<LogServiceMock> = {
      getHeadCommitHash: vi.fn().mockResolvedValue(ok('abc123')),
      getCommitPosition: vi.fn(),
    };
    const { context, postMessage } = makeContext(gitLogService);

    await graphDataHandlers.locateHead(locateHeadMessage('abc123'), context);

    expect(gitLogService.getCommitPosition).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'headLocation',
      payload: { hash: 'abc123', index: null },
    });
  });

  it('walks the log when the displayed HEAD is stale', async () => {
    const gitLogService: Partial<LogServiceMock> = {
      getHeadCommitHash: vi.fn().mockResolvedValue(ok('abc123')),
      getCommitPosition: vi.fn().mockResolvedValue(ok(4200)),
    };
    const { context, postMessage } = makeContext(gitLogService);

    await graphDataHandlers.locateHead(locateHeadMessage('oldhead'), context);

    expect(gitLogService.getCommitPosition).toHaveBeenCalledWith('abc123', {});
    expect(postMessage).toHaveBeenCalledWith({
      type: 'headLocation',
      payload: { hash: 'abc123', index: 4200 },
    });
  });

  it('walks the log when HEAD is not displayed at all', async () => {
    const gitLogService: Partial<LogServiceMock> = {
      getHeadCommitHash: vi.fn().mockResolvedValue(ok('abc123')),
      getCommitPosition: vi.fn().mockResolvedValue(ok(-1)),
    };
    const { context, postMessage } = makeContext(gitLogService);

    await graphDataHandlers.locateHead(locateHeadMessage(null), context);

    expect(gitLogService.getCommitPosition).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'headLocation',
      payload: { hash: 'abc123', index: -1 },
    });
  });

  it('reports an unresolvable HEAD as a normal empty location, not an error', async () => {
    const gitLogService: Partial<LogServiceMock> = {
      getHeadCommitHash: vi.fn().mockResolvedValue(err(new GitError('bad revision', 'UNKNOWN'))),
    };
    const { context, postMessage } = makeContext(gitLogService);

    await graphDataHandlers.locateHead(locateHeadMessage(null), context);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'headLocation',
      payload: { hash: null, index: -1 },
    });
  });

  it('reports a failed position walk on its own channel, not the generic error', async () => {
    const error = new GitError('git log failed', 'UNKNOWN');
    const gitLogService: Partial<LogServiceMock> = {
      getHeadCommitHash: vi.fn().mockResolvedValue(ok('abc123')),
      getCommitPosition: vi.fn().mockResolvedValue(err(error)),
    };
    const { context, postMessage } = makeContext(gitLogService);

    await graphDataHandlers.locateHead(locateHeadMessage(null), context);

    expect(postMessage).toHaveBeenCalledWith({ type: 'headLocationFailed', payload: { error } });
  });
});

// Ref-name parsing itself is GitLogService's job and is covered there; this only
// pins how the handler turns the service's Result into a webview message.
describe('graphDataHandlers.getContainingBranches', () => {
  async function run(result: Awaited<ReturnType<GitLogService['getContainingBranches']>>) {
    const { context, postMessage } = makeContext({
      getContainingBranches: vi.fn().mockResolvedValue(result),
    });
    await graphDataHandlers.getContainingBranches(
      { type: 'getContainingBranches', payload: { hash: 'abc123' } },
      context,
    );
    return postMessage;
  }

  it('forwards the branches the service resolved', async () => {
    const postMessage = await run(ok(['main', 'origin/main']));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'containingBranches',
      payload: { hash: 'abc123', branches: ['main', 'origin/main'], status: 'loaded' },
    });
  });

  it('reports an error status when the service fails', async () => {
    const postMessage = await run(err(new GitError('boom', 'UNKNOWN')));

    expect(postMessage).toHaveBeenCalledWith({
      type: 'containingBranches',
      payload: { hash: 'abc123', branches: [], status: 'error' },
    });
  });
});
