import { describe, expect, it, vi } from 'vitest';
import { worktreeHandlers } from '../webview/handlers/worktreeHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

interface WorktreeServiceMock {
  addWorktree: ReturnType<typeof vi.fn>;
  copyIgnoredEnvFilesTo: ReturnType<typeof vi.fn>;
  detectCopyableEnvFiles: ReturnType<typeof vi.fn>;
}

function makeContext(gitWorktreeService: Partial<WorktreeServiceMock>) {
  const postMessage = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const openWorktreeFolder = vi.fn().mockResolvedValue(undefined);
  const context = {
    services: { current: () => ({ gitWorktreeService }) },
    postMessage,
    refreshCoordinator: { reload },
    editorCommands: { openWorktreeFolder },
  } as unknown as WebviewRequestContext;
  return { context, postMessage, reload, openWorktreeFolder };
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
