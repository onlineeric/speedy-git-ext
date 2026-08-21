import { describe, expect, it, vi } from 'vitest';
import { branchHandlers } from '../webview/handlers/branchHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import { ok, err, GitError } from '../../shared/errors.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(() => Promise.resolve(undefined)) },
}));

function makeContext(
  gitBranchService: Record<string, unknown>,
  operationInProgress: GitError | null = null,
  /** What git reports once the command has run — the handler reads it back. */
  mergeStateAfter: 'idle' | 'in-progress' = 'idle',
) {
  const postMessage = vi.fn();
  const reload = vi.fn().mockResolvedValue(undefined);
  const services = {
    getMergeState: vi.fn().mockResolvedValue(ok(mergeStateAfter)),
    ...gitBranchService,
  };
  const context = {
    services: { current: () => ({ gitBranchService: services }) },
    postMessage,
    operationGuard: { getOperationInProgressError: vi.fn().mockResolvedValue(operationInProgress) },
    refreshCoordinator: { reload },
    runtime: { currentRepoPath: '/repo' },
    log: {},
  } as unknown as WebviewRequestContext;
  return { context, postMessage, reload };
}

const mergeRequest = (branch: string) =>
  ({ type: 'mergeBranch', payload: { branch } }) as const;

/** Every `mergeState` value posted, in order. */
function mergeStates(postMessage: ReturnType<typeof vi.fn>): string[] {
  return postMessage.mock.calls
    .filter(([m]) => m.type === 'mergeState')
    .map(([m]) => m.payload.state);
}

describe('branchHandlers.mergeBranch', () => {
  it('passes the ref through untouched — a hash is as valid as a branch name', async () => {
    const gitBranchService = { merge: vi.fn().mockResolvedValue(ok("Merged 'a1b2c3d' into current branch")) };
    const { context } = makeContext(gitBranchService);

    await branchHandlers.mergeBranch(
      { type: 'mergeBranch', payload: { branch: 'a1b2c3d', squash: true } },
      context,
    );

    expect(gitBranchService.merge).toHaveBeenCalledWith('a1b2c3d', undefined, true, undefined);
  });

  it('refuses before spawning git when another operation is in progress', async () => {
    const gitBranchService = { merge: vi.fn() };
    const guardError = new GitError('Another git operation is already in progress (rebase).', 'OPERATION_IN_PROGRESS');
    const { context, postMessage } = makeContext(gitBranchService, guardError);

    await branchHandlers.mergeBranch(mergeRequest('feature-x'), context);

    expect(gitBranchService.merge).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ type: 'error', payload: { error: guardError } });
    // No state post: the guard says nothing about where *this* merge stands.
    expect(mergeStates(postMessage)).toEqual([]);
  });

  it('enters the merge-in-progress state on a recoverable conflict', async () => {
    const gitBranchService = {
      merge: vi.fn().mockResolvedValue(err(new GitError('Merge paused due to conflict.', 'MERGE_CONFLICT'))),
    };
    const { context, postMessage, reload } = makeContext(gitBranchService, null, 'in-progress');

    await branchHandlers.mergeBranch(mergeRequest('feature-x'), context);

    expect(mergeStates(postMessage)).toEqual(['in-progress']);
    // The conflicted files only reach the working-tree panel via a reload.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('stays idle for a conflict git left no MERGE_HEAD for, so Continue/Abort are not offered', async () => {
    const gitBranchService = {
      merge: vi.fn().mockResolvedValue(err(new GitError('Merge stopped due to conflict.', 'MERGE_CONFLICT_NO_RECOVERY'))),
    };
    const { context, postMessage, reload } = makeContext(gitBranchService);

    await branchHandlers.mergeBranch(mergeRequest('feature-x'), context);

    expect(mergeStates(postMessage)).toEqual(['idle']);
    // It still conflicted, so the working-tree panel is stale either way.
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload for a merge that failed without touching anything', async () => {
    const gitBranchService = {
      merge: vi.fn().mockResolvedValue(err(new GitError('local changes would be overwritten', 'COMMAND_FAILED'))),
    };
    const { context, reload } = makeContext(gitBranchService);

    await branchHandlers.mergeBranch(mergeRequest('feature-x'), context);

    expect(reload).not.toHaveBeenCalled();
  });

  it('reports a successful --no-commit merge as still in progress', async () => {
    const gitBranchService = { merge: vi.fn().mockResolvedValue(ok("Merged 'feature-x' into current branch")) };
    // `--no-commit` succeeds but leaves MERGE_HEAD, so Continue/Abort still apply.
    const { context, postMessage } = makeContext(gitBranchService, null, 'in-progress');

    await branchHandlers.mergeBranch(
      { type: 'mergeBranch', payload: { branch: 'feature-x', noCommit: true } },
      context,
    );

    expect(mergeStates(postMessage)).toEqual(['in-progress']);
  });

  it('clears the state and reloads on success', async () => {
    const gitBranchService = { merge: vi.fn().mockResolvedValue(ok("Merged 'feature-x' into current branch")) };
    const { context, postMessage, reload } = makeContext(gitBranchService);

    await branchHandlers.mergeBranch(mergeRequest('feature-x'), context);

    expect(mergeStates(postMessage)).toEqual(['idle']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('branchHandlers continueMerge / abortMerge', () => {
  it('runs Continue without the guard — the paused merge is what it is acting on', async () => {
    const gitBranchService = { continueMerge: vi.fn().mockResolvedValue(ok('Merge continued successfully.')) };
    const guardError = new GitError('Another git operation is already in progress (merge).', 'OPERATION_IN_PROGRESS');
    const { context, postMessage } = makeContext(gitBranchService, guardError);

    await branchHandlers.continueMerge({ type: 'continueMerge', payload: {} }, context);

    expect(gitBranchService.continueMerge).toHaveBeenCalledTimes(1);
    expect(mergeStates(postMessage)).toEqual(['idle']);
  });

  it('keeps the merge in progress when Continue hits the next conflict', async () => {
    const gitBranchService = {
      continueMerge: vi.fn().mockResolvedValue(err(new GitError('still conflicted', 'MERGE_CONFLICT'))),
    };
    const { context, postMessage } = makeContext(gitBranchService, null, 'in-progress');

    await branchHandlers.continueMerge({ type: 'continueMerge', payload: {} }, context);

    expect(mergeStates(postMessage)).toEqual(['in-progress']);
  });

  it('leaves the conflict UI up when Abort fails', async () => {
    const gitBranchService = {
      abortMerge: vi.fn().mockResolvedValue(err(new GitError('fatal: there is no merge to abort', 'COMMAND_FAILED'))),
    };
    const { context, postMessage } = makeContext(gitBranchService, null, 'in-progress');

    await branchHandlers.abortMerge({ type: 'abortMerge', payload: {} }, context);

    expect(mergeStates(postMessage)).toEqual(['in-progress']);
    expect(postMessage.mock.calls.some(([m]) => m.type === 'error')).toBe(true);
  });

  it('drops out of the merge state when Continue fails on an already-finished merge', async () => {
    const gitBranchService = {
      continueMerge: vi.fn().mockResolvedValue(err(new GitError('fatal: MERGE_HEAD missing', 'COMMAND_FAILED'))),
    };
    // The user resolved and committed in the Source Control panel, so git has no
    // merge left. Reporting "in progress" here would strand every other action.
    const { context, postMessage } = makeContext(gitBranchService, null, 'idle');

    await branchHandlers.continueMerge({ type: 'continueMerge', payload: {} }, context);

    expect(mergeStates(postMessage)).toEqual(['idle']);
  });

  it('clears the state when Abort succeeds', async () => {
    const gitBranchService = { abortMerge: vi.fn().mockResolvedValue(ok('Merge aborted.')) };
    const { context, postMessage, reload } = makeContext(gitBranchService);

    await branchHandlers.abortMerge({ type: 'abortMerge', payload: {} }, context);

    expect(mergeStates(postMessage)).toEqual(['idle']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
