import { describe, expect, it, vi } from 'vitest';
import { historyHandlers } from '../webview/handlers/historyHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(() => Promise.resolve(undefined)) },
}));

/**
 * Builds a context whose `gitRebaseService` exposes *only* the methods passed in, so a
 * handler that reaches for anything else — a re-added working-tree pre-check, say —
 * throws instead of quietly passing.
 */
function makeContext(gitRebaseService: Record<string, unknown>, operationInProgress: GitError | null = null) {
  const postMessage = vi.fn();
  const context = {
    services: { current: () => ({ gitRebaseService }) },
    postMessage,
    operationGuard: { getOperationInProgressError: vi.fn().mockResolvedValue(operationInProgress) },
    refreshCoordinator: { reload: vi.fn().mockResolvedValue(undefined) },
    runtime: { currentRepoPath: '/repo' },
    log: {},
  } as unknown as WebviewRequestContext;
  return { context, postMessage };
}

/**
 * These cases exist to keep one rule in place: Speedy Git must not invent preconditions
 * that git itself does not impose. `git rebase` refuses on tracked changes and tolerates
 * untracked files; deciding that here once blocked rebases over nothing but untracked
 * directories. The operations must reach git, and git's refusal must reach the user.
 */
describe('historyHandlers — no working-tree preconditions of our own', () => {
  it('rebases without pre-checking the working tree', async () => {
    const gitRebaseService = { rebase: vi.fn().mockResolvedValue(ok('Rebased onto main.')) };
    const { context } = makeContext(gitRebaseService);

    await historyHandlers.rebase(
      { type: 'rebase', payload: { targetRef: 'main', ignoreDate: false } },
      context,
    );

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
    const gitRebaseService = { getRebaseCommits: vi.fn().mockResolvedValue(ok([])) };
    const { context, postMessage } = makeContext(gitRebaseService);

    await historyHandlers.getRebaseCommits(
      { type: 'getRebaseCommits', payload: { baseHash: 'abc1234' } },
      context,
    );

    expect(postMessage).toHaveBeenCalledWith({ type: 'rebaseCommits', payload: { entries: [] } });
  });

  it('drops a commit without pre-checking the working tree', async () => {
    const gitRebaseService = {
      getRebaseCommits: vi.fn().mockResolvedValue(ok([{ hash: 'abc1234', abbreviatedHash: 'abc1234', subject: 'x' }])),
      interactiveRebase: vi.fn().mockResolvedValue(ok('done')),
    };
    const { context } = makeContext(gitRebaseService);

    await historyHandlers.dropCommit({ type: 'dropCommit', payload: { hash: 'abc1234' } }, context);

    expect(gitRebaseService.interactiveRebase).toHaveBeenCalled();
  });
});

describe('historyHandlers — git preconditions we do keep', () => {
  // Starting a rebase while another sequencer operation runs is refused by git too.
  // Letting it through makes git fail with "there is already a rebase-merge directory",
  // which the service reads as a conflict (that directory exists), and an interactive
  // rebase would overwrite the paused rebase's temp scripts on the way past.
  const inProgress = new GitError('Another git operation is already in progress (rebase).', 'OPERATION_IN_PROGRESS');

  it('refuses to start a rebase while another operation is in progress', async () => {
    const gitRebaseService = { rebase: vi.fn() };
    const { context, postMessage } = makeContext(gitRebaseService, inProgress);

    await historyHandlers.rebase(
      { type: 'rebase', payload: { targetRef: 'main', ignoreDate: false } },
      context,
    );

    expect(gitRebaseService.rebase).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: inProgress } });
    // Never claim idle here — the paused operation's UI must stay up.
    expect(postMessage.mock.calls.some(([m]) => m.type === 'rebaseState')).toBe(false);
  });

  it('refuses to start an interactive rebase while another operation is in progress', async () => {
    const gitRebaseService = { interactiveRebase: vi.fn() };
    const { context, postMessage } = makeContext(gitRebaseService, inProgress);

    await historyHandlers.interactiveRebase(
      { type: 'interactiveRebase', payload: { config: { baseHash: 'abc1234', entries: [], squashMessages: [] } } },
      context,
    );

    expect(gitRebaseService.interactiveRebase).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: inProgress } });
  });

  it('refuses to drop a commit while another operation is in progress', async () => {
    // Dropping rewrites history through the same interactive rebase, so it shares the guard.
    const gitRebaseService = { getRebaseCommits: vi.fn(), interactiveRebase: vi.fn() };
    const { context, postMessage } = makeContext(gitRebaseService, inProgress);

    await historyHandlers.dropCommit({ type: 'dropCommit', payload: { hash: 'abc1234' } }, context);

    expect(gitRebaseService.getRebaseCommits).not.toHaveBeenCalled();
    expect(gitRebaseService.interactiveRebase).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: inProgress } });
    expect(postMessage.mock.calls.some(([m]) => m.type === 'rebaseState')).toBe(false);
  });
});
