import { describe, expect, it, vi } from 'vitest';
import { graphDataHandlers } from '../webview/handlers/graphDataHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(() => Promise.resolve(undefined)) },
}));

const execute = vi.fn();
vi.mock('../services/GitExecutor.js', () => ({
  GitExecutor: class {
    execute = (...args: unknown[]) => execute(...args);
  },
}));

interface LogServiceMock {
  getHeadCommitHash: ReturnType<typeof vi.fn>;
  getCommitPosition: ReturnType<typeof vi.fn>;
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

describe('graphDataHandlers.getContainingBranches', () => {
  async function run(stdout: string) {
    execute.mockResolvedValue(ok({ stdout, stderr: '' }));
    const { context, postMessage } = makeContext();
    await graphDataHandlers.getContainingBranches(
      { type: 'getContainingBranches', payload: { hash: 'abc123' } },
      context,
    );
    return { postMessage, branches: postMessage.mock.calls[0][0].payload.branches as string[] };
  }

  it('asks git for fully-qualified ref names', async () => {
    await run('refs/heads/main\n');

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      args: ['branch', '-a', '--contains', 'abc123', '--format=%(refname)'],
      cwd: '/repo',
    }));
  });

  it('distinguishes a slashed local branch from a remote-tracking branch', async () => {
    const { branches } = await run('refs/heads/eric/wip\nrefs/remotes/origin/eric/wip\n');

    expect(branches).toEqual(['eric/wip', 'origin/eric/wip']);
  });

  it('keeps a local branch named release/HEAD but drops the remote HEAD pointer', async () => {
    const { branches } = await run('refs/heads/release/HEAD\nrefs/remotes/origin/HEAD\n');

    expect(branches).toEqual(['release/HEAD']);
  });

  it('drops the detached-HEAD pseudo entry', async () => {
    const { branches } = await run('(HEAD detached at abc1234)\nrefs/heads/main\n');

    expect(branches).toEqual(['main']);
  });

  it('reports an error status when git fails', async () => {
    execute.mockResolvedValue(err(new GitError('boom', 'UNKNOWN')));
    const { context, postMessage } = makeContext();

    await graphDataHandlers.getContainingBranches(
      { type: 'getContainingBranches', payload: { hash: 'abc123' } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'containingBranches',
      payload: { hash: 'abc123', branches: [], status: 'error' },
    });
  });
});
