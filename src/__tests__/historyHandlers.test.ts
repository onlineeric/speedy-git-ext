import { describe, expect, it, vi } from 'vitest';
import { historyHandlers } from '../webview/handlers/historyHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(() => Promise.resolve(undefined)) },
}));

/**
 * These cases exist to keep one rule in place: Speedy Git must not invent preconditions
 * that git itself does not impose. `git rebase` refuses on tracked changes and tolerates
 * untracked files; deciding that here once blocked rebases over nothing but untracked
 * directories. The operations must reach git, and git's refusal must reach the user.
 */
function makeContext(gitRebaseService: Record<string, unknown>) {
  const postMessage = vi.fn();
  const context = {
    services: { current: () => ({ gitRebaseService }) },
    postMessage,
    operationGuard: { getOperationInProgressError: vi.fn().mockResolvedValue(null) },
    refreshCoordinator: { reload: vi.fn().mockResolvedValue(undefined) },
    runtime: { currentRepoPath: '/repo' },
    log: {},
  } as unknown as WebviewRequestContext;
  return { context, postMessage };
}

describe('historyHandlers — no working-tree preconditions of our own', () => {
  it('rebases without pre-checking the working tree', async () => {
    const gitRebaseService = {
      isDirtyWorkingTree: vi.fn(),
      rebase: vi.fn().mockResolvedValue(ok('Rebased onto main.')),
    };
    const { context } = makeContext(gitRebaseService);

    await historyHandlers.rebase(
      { type: 'rebase', payload: { targetRef: 'main', ignoreDate: false } },
      context,
    );

    expect(gitRebaseService.isDirtyWorkingTree).not.toHaveBeenCalled();
    expect(gitRebaseService.rebase).toHaveBeenCalledWith('main', false);
  });

  it("passes git's own refusal through untouched", async () => {
    const gitRefusal = 'error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.';
    const gitRebaseService = {
      rebase: vi.fn().mockResolvedValue(err(new GitError(gitRefusal, 'COMMAND_FAILED'))),
    };
    const { context, postMessage } = makeContext(gitRebaseService);

    await historyHandlers.rebase(
      { type: 'rebase', payload: { targetRef: 'main', ignoreDate: false } },
      context,
    );

    const errorPost = postMessage.mock.calls.find(([m]) => m.type === 'error');
    expect(errorPost?.[0].payload.error.message).toBe(gitRefusal);
  });

  it('opens the interactive rebase dialog regardless of working-tree state', async () => {
    // getRebaseCommits is a plain `git log` read with no precondition of its own.
    const gitRebaseService = {
      isDirtyWorkingTree: vi.fn(),
      getRebaseCommits: vi.fn().mockResolvedValue(ok([])),
    };
    const { context, postMessage } = makeContext(gitRebaseService);

    await historyHandlers.getRebaseCommits(
      { type: 'getRebaseCommits', payload: { baseHash: 'abc1234' } },
      context,
    );

    expect(gitRebaseService.isDirtyWorkingTree).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'rebaseCommits', payload: { entries: [] } });
  });

  it('drops a commit without pre-checking the working tree', async () => {
    const gitRebaseService = {
      isDirtyWorkingTree: vi.fn(),
      getRebaseCommits: vi.fn().mockResolvedValue(ok([{ hash: 'abc1234', abbreviatedHash: 'abc1234', subject: 'x' }])),
      interactiveRebase: vi.fn().mockResolvedValue(ok('done')),
    };
    const { context } = makeContext(gitRebaseService);

    await historyHandlers.dropCommit({ type: 'dropCommit', payload: { hash: 'abc1234' } }, context);

    expect(gitRebaseService.isDirtyWorkingTree).not.toHaveBeenCalled();
    expect(gitRebaseService.interactiveRebase).toHaveBeenCalled();
  });
});
