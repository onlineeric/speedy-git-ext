import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { historyHandlers } from '../webview/handlers/historyHandlers.js';
import { branchHandlers } from '../webview/handlers/branchHandlers.js';
import { remoteHandlers } from '../webview/handlers/remoteHandlers.js';
import { revalidateRef } from '../webview/handlers/revalidateRef.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';
import type { RefExpectation } from '../../shared/refRevalidation.js';

vi.mock('vscode', () => ({
  window: { showErrorMessage: vi.fn(), showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
  env: { clipboard: { writeText: vi.fn() }, openExternal: vi.fn() },
  Uri: { parse: vi.fn(), file: vi.fn(), joinPath: vi.fn(), from: vi.fn() },
}));

const OLD_HASH = 'a'.repeat(40);
const NEW_HASH = 'b'.repeat(40);
const EXPECT: RefExpectation = { ref: 'main', expectedHash: OLD_HASH };

/** A context whose `resolveRefHash` answers `actual`, plus whatever services the handler needs. */
function createContext(actual: string | null, serviceOverrides: Record<string, unknown> = {}) {
  const postMessage = vi.fn();
  const services = new GitServiceRegistry({
    gitLogService: { resolveRefHash: vi.fn().mockResolvedValue(actual) },
    ...serviceOverrides,
  } as never);
  return {
    context: {
      services,
      postMessage,
      runtime: { currentRepoPath: '/repo' },
      operationGuard: { getOperationInProgressError: vi.fn().mockResolvedValue(null) },
      refreshCoordinator: { reload: vi.fn().mockResolvedValue(undefined) },
      getGitVersion: vi.fn().mockResolvedValue(null),
    } as unknown as WebviewRequestContext,
    postMessage,
    services,
  };
}

function lastError(postMessage: ReturnType<typeof vi.fn>) {
  const call = postMessage.mock.calls.find(([message]) => message.type === 'error');
  return call?.[0].payload.error as { code: string; message: string } | undefined;
}

describe('revalidateRef', () => {
  it('answers null when the ref still points where the dialog saw it', async () => {
    const { context } = createContext(OLD_HASH);
    await expect(revalidateRef(EXPECT, context)).resolves.toBeNull();
  });

  it('answers a REF_MOVED error when the ref moved', async () => {
    const { context } = createContext(NEW_HASH);
    const error = await revalidateRef(EXPECT, context);
    expect(error?.code).toBe('REF_MOVED');
    expect(error?.message).toContain('`main` changed since you opened this dialog');
  });

  it('answers a REF_MOVED error when the ref is gone', async () => {
    const { context } = createContext(null);
    const error = await revalidateRef(EXPECT, context);
    expect(error?.code).toBe('REF_MOVED');
    expect(error?.message).toContain('no longer exists');
  });

  it('answers null — and spawns nothing — when no expectation was sent', async () => {
    const { context, services } = createContext(OLD_HASH);
    await expect(revalidateRef(undefined, context)).resolves.toBeNull();
    expect(services.current().gitLogService.resolveRefHash).not.toHaveBeenCalled();
  });
});

describe('the five revalidated actions refuse before mutating', () => {
  it('resetBranch', async () => {
    const reset = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitHistoryService: { reset } });

    await historyHandlers.resetBranch(
      { type: 'resetBranch', payload: { hash: NEW_HASH, mode: 'hard', expect: EXPECT } },
      context,
    );

    expect(reset).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('rebase', async () => {
    const rebase = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitRebaseService: { rebase } });

    await historyHandlers.rebase(
      { type: 'rebase', payload: { targetRef: 'main', expect: EXPECT } },
      context,
    );

    expect(rebase).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('rebase also checks HEAD, the near end of the replayed range', async () => {
    const rebase = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitRebaseService: { rebase } });

    await historyHandlers.rebase(
      {
        type: 'rebase',
        payload: { targetRef: 'main', expectHead: { ref: 'HEAD', expectedHash: OLD_HASH } },
      },
      context,
    );

    expect(rebase).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.message).toContain('`HEAD`');
  });

  it('interactiveRebase — its todo list must never be replayed against a moved tip', async () => {
    const interactiveRebase = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitRebaseService: { interactiveRebase } });

    await historyHandlers.interactiveRebase(
      {
        type: 'interactiveRebase',
        payload: {
          config: { baseHash: 'abc', entries: [], squashMessages: [] },
          expectHead: { ref: 'HEAD', expectedHash: OLD_HASH },
        },
      },
      context,
    );

    expect(interactiveRebase).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('dropCommit', async () => {
    const getRebaseCommits = vi.fn();
    const interactiveRebase = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, {
      gitRebaseService: { getRebaseCommits, interactiveRebase },
    });

    await historyHandlers.dropCommit(
      { type: 'dropCommit', payload: { hash: OLD_HASH, expect: { ref: 'HEAD', expectedHash: OLD_HASH } } },
      context,
    );

    expect(getRebaseCommits).not.toHaveBeenCalled();
    expect(interactiveRebase).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('deleteBranch', async () => {
    const deleteBranch = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitBranchService: { deleteBranch } });

    await branchHandlers.deleteBranch(
      { type: 'deleteBranch', payload: { name: 'main', expect: EXPECT } },
      context,
    );

    expect(deleteBranch).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('deleteRemoteBranch', async () => {
    const deleteRemoteBranch = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitBranchService: { deleteRemoteBranch } });

    await branchHandlers.deleteRemoteBranch(
      {
        type: 'deleteRemoteBranch',
        payload: { remote: 'origin', name: 'main', expect: { ref: 'origin/main', expectedHash: OLD_HASH } },
      },
      context,
    );

    expect(deleteRemoteBranch).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });

  it('push', async () => {
    const push = vi.fn();
    const { context, postMessage } = createContext(NEW_HASH, { gitRemoteService: { push } });

    await remoteHandlers.push(
      {
        type: 'push',
        payload: {
          remote: 'origin',
          branch: 'main',
          forceMode: 'force-with-lease',
          expect: { ref: 'origin/main', expectedHash: OLD_HASH },
        },
      },
      context,
    );

    expect(push).not.toHaveBeenCalled();
    expect(lastError(postMessage)?.code).toBe('REF_MOVED');
  });
});

describe('an unmoved ref lets the action through unchanged', () => {
  it('resetBranch runs when the branch is where the dialog left it', async () => {
    const reset = vi.fn().mockResolvedValue({ success: true, value: 'Reset' });
    const { context, postMessage } = createContext(OLD_HASH, { gitHistoryService: { reset } });

    await historyHandlers.resetBranch(
      { type: 'resetBranch', payload: { hash: NEW_HASH, mode: 'hard', expect: EXPECT } },
      context,
    );

    expect(reset).toHaveBeenCalledWith(NEW_HASH, 'hard');
    expect(lastError(postMessage)).toBeUndefined();
  });

  it('an action that sends no expectation behaves exactly as before', async () => {
    const reset = vi.fn().mockResolvedValue({ success: true, value: 'Reset' });
    const { context, services } = createContext(NEW_HASH, { gitHistoryService: { reset } });

    await historyHandlers.resetBranch(
      { type: 'resetBranch', payload: { hash: NEW_HASH, mode: 'soft' } },
      context,
    );

    expect(reset).toHaveBeenCalled();
    expect(services.current().gitLogService.resolveRefHash).not.toHaveBeenCalled();
  });
});
