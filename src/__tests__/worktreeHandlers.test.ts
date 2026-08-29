import { describe, expect, it, vi } from 'vitest';
import { worktreeHandlers } from '../webview/handlers/worktreeHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

interface WorktreeServiceMock {
  addWorktree: ReturnType<typeof vi.fn>;
  copyIgnoredEnvFilesTo: ReturnType<typeof vi.fn>;
  detectCopyableEnvFiles: ReturnType<typeof vi.fn>;
  listWorktrees: ReturnType<typeof vi.fn>;
  resolveBaseDir: ReturnType<typeof vi.fn>;
  resolveWorktreePath: ReturnType<typeof vi.fn>;
  removeWorktree: ReturnType<typeof vi.fn>;
  pruneWorktrees: ReturnType<typeof vi.fn>;
}

function makeContext(gitWorktreeService: Partial<WorktreeServiceMock>) {
  const postMessage = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const openWorktreeFolder = vi.fn().mockResolvedValue(undefined);
  const findRemovableWorktree = vi.fn().mockResolvedValue(ok(undefined));
  const context = {
    services: { current: () => ({ gitWorktreeService }) },
    postMessage,
    getSettings: () => ({ worktreeBasePath: '../${repoName}.worktrees' }),
    refreshCoordinator: { reload },
    editorCommands: { openWorktreeFolder, findRemovableWorktree },
  } as unknown as WebviewRequestContext;
  return { context, postMessage, reload, openWorktreeFolder, findRemovableWorktree };
}

function addWorktreeMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: 'addWorktree' as const,
    payload: {
      path: '/wt/feature',
      ref: 'feature',
      branchMode: 'existing' as const,
      ...overrides,
    },
  };
}

describe('worktreeHandlers.addWorktree — env-file copy orchestration', () => {
  it('does not copy env files when copyEnvFiles is not set', async () => {
    const service: Partial<WorktreeServiceMock> = {
      addWorktree: vi.fn().mockResolvedValue(ok(undefined)),
      copyIgnoredEnvFilesTo: vi.fn(),
    };
    const { context, postMessage, reload, openWorktreeFolder } = makeContext(service);

    await worktreeHandlers.addWorktree(addWorktreeMessage(), context);

    expect(service.copyIgnoredEnvFilesTo).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: 'Worktree created' } });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(openWorktreeFolder).toHaveBeenCalledWith('/wt/feature');
  });

  it('copies env files and reports plain success when nothing is skipped', async () => {
    const service: Partial<WorktreeServiceMock> = {
      addWorktree: vi.fn().mockResolvedValue(ok(undefined)),
      copyIgnoredEnvFilesTo: vi.fn().mockResolvedValue(ok({ copied: ['.env'], skippedNotIgnored: [] })),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.addWorktree(addWorktreeMessage({ copyEnvFiles: true }), context);

    expect(service.copyIgnoredEnvFilesTo).toHaveBeenCalledWith('/wt/feature');
    expect(postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: 'Worktree created' } });
  });

  it('surfaces a security-aware message when the target branch does not ignore some files', async () => {
    const service: Partial<WorktreeServiceMock> = {
      addWorktree: vi.fn().mockResolvedValue(ok(undefined)),
      copyIgnoredEnvFilesTo: vi
        .fn()
        .mockResolvedValue(ok({ copied: ['.env'], skippedNotIgnored: ['.env.dev'] })),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.addWorktree(addWorktreeMessage({ copyEnvFiles: true }), context);

    const successCall = postMessage.mock.calls.find((c) => c[0].type === 'success');
    expect(successCall?.[0].payload.message).toContain('.env.dev');
    expect(successCall?.[0].payload.message).toMatch(/does not git-ignore/);
  });

  it('reports an error and skips copy/reload when worktree creation fails', async () => {
    const service: Partial<WorktreeServiceMock> = {
      addWorktree: vi.fn().mockResolvedValue(err(new GitError('boom', 'COMMAND_FAILED'))),
      copyIgnoredEnvFilesTo: vi.fn(),
    };
    const { context, postMessage, reload, openWorktreeFolder } = makeContext(service);

    await worktreeHandlers.addWorktree(addWorktreeMessage({ copyEnvFiles: true }), context);

    expect(service.copyIgnoredEnvFilesTo).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(openWorktreeFolder).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { error: expect.objectContaining({ message: 'boom' }) },
    });
  });
});

describe('worktreeHandlers.getWorktreeEnvFiles', () => {
  it('posts the detected ignored env files on success', async () => {
    const service: Partial<WorktreeServiceMock> = {
      detectCopyableEnvFiles: vi
        .fn()
        .mockResolvedValue(ok({ ignoredEnvFiles: ['.env', '.env.local'], envFilesPresent: true })),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.getWorktreeEnvFiles(
      { type: 'getWorktreeEnvFiles', payload: { requestId: 1 } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'worktreeEnvFiles',
      payload: { requestId: 1, ignoredEnvFiles: ['.env', '.env.local'], envFilesPresent: true },
    });
  });

  it('posts safe defaults when detection fails', async () => {
    const service: Partial<WorktreeServiceMock> = {
      detectCopyableEnvFiles: vi.fn().mockResolvedValue(err(new GitError('nope', 'COMMAND_FAILED'))),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.getWorktreeEnvFiles(
      { type: 'getWorktreeEnvFiles', payload: { requestId: 2 } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'worktreeEnvFiles',
      payload: { requestId: 2, ignoredEnvFiles: [], envFilesPresent: false },
    });
  });
});

describe('worktreeHandlers.resolveWorktreePath', () => {
  it('posts both candidate paths and the hierarchical flag', async () => {
    const service: Partial<WorktreeServiceMock> = {
      resolveWorktreePath: vi.fn().mockResolvedValue(
        ok({ nestedPath: '/wt/feat/x', flatPath: '/wt/feat-x', hierarchical: true }),
      ),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.resolveWorktreePath(
      { type: 'resolveWorktreePath', payload: { ref: 'feat/x', branchMode: 'existing', requestId: 7 } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'worktreePathResolved',
      payload: { nestedPath: '/wt/feat/x', flatPath: '/wt/feat-x', hierarchical: true, requestId: 7 },
    });
  });

  it('posts an error when resolution fails', async () => {
    const service: Partial<WorktreeServiceMock> = {
      resolveWorktreePath: vi.fn().mockResolvedValue(err(new GitError('nope', 'COMMAND_FAILED'))),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.resolveWorktreePath(
      { type: 'resolveWorktreePath', payload: { ref: 'feat/x', branchMode: 'existing', requestId: 8 } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { error: expect.objectContaining({ message: 'nope' }) },
    });
  });
});

describe('worktreeHandlers.getWorktreeList', () => {
  it('includes the resolved base dir so labels can be shown relative to it', async () => {
    const service: Partial<WorktreeServiceMock> = {
      listWorktrees: vi.fn().mockResolvedValue(ok([{ path: '/wt/feat/x' }])),
      resolveBaseDir: vi.fn().mockReturnValue('/wt'),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.getWorktreeList({ type: 'getWorktreeList', payload: {} }, context);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'worktreeList',
      payload: { worktrees: [{ path: '/wt/feat/x' }], baseDir: '/wt' },
    });
  });

  it('posts an empty list with a base dir still resolved when listing fails', async () => {
    const service: Partial<WorktreeServiceMock> = {
      listWorktrees: vi.fn().mockResolvedValue(err(new GitError('nope', 'COMMAND_FAILED'))),
      resolveBaseDir: vi.fn().mockReturnValue(null),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.getWorktreeList({ type: 'getWorktreeList', payload: {} }, context);

    expect(postMessage).toHaveBeenCalledWith({
      type: 'worktreeList',
      payload: { worktrees: [], baseDir: null },
    });
  });
});

describe('worktreeHandlers.removeWorktree / pruneWorktree', () => {
  it('passes the resolved base dir into the removal so emptied parents are cleaned up', async () => {
    const service: Partial<WorktreeServiceMock> = {
      listWorktrees: vi.fn().mockResolvedValue(ok([])),
      resolveBaseDir: vi.fn().mockReturnValue('/wt'),
      removeWorktree: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.removeWorktree(
      { type: 'removeWorktree', payload: { path: '/wt/feat/x', force: true } },
      context,
    );

    expect(service.removeWorktree).toHaveBeenCalledWith('/wt/feat/x', { force: true, baseDir: '/wt' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: 'Worktree removed' } });
  });

  it('does not remove anything when the guard refuses', async () => {
    const service: Partial<WorktreeServiceMock> = { removeWorktree: vi.fn() };
    const { context, findRemovableWorktree, postMessage } = makeContext(service);
    findRemovableWorktree.mockResolvedValue(err(new GitError('main worktree', 'VALIDATION_ERROR')));

    await worktreeHandlers.removeWorktree(
      { type: 'removeWorktree', payload: { path: '/wt/main' } },
      context,
    );

    expect(service.removeWorktree).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { error: expect.objectContaining({ message: 'main worktree' }) },
    });
  });

  it('passes the resolved base dir into the prune so the base path is swept', async () => {
    const service: Partial<WorktreeServiceMock> = {
      listWorktrees: vi.fn().mockResolvedValue(ok([])),
      resolveBaseDir: vi.fn().mockReturnValue('/wt'),
      pruneWorktrees: vi.fn().mockResolvedValue(ok(undefined)),
    };
    const { context, postMessage } = makeContext(service);

    await worktreeHandlers.pruneWorktree({ type: 'pruneWorktree', payload: {} }, context);

    expect(service.pruneWorktrees).toHaveBeenCalledWith({ baseDir: '/wt' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: 'Worktrees pruned' } });
  });
});
