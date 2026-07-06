import { describe, expect, it, vi } from 'vitest';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { WebviewMessageRouter, requestHandlers } from '../webview/WebviewMessageRouter.js';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
  },
  env: {
    clipboard: { writeText: vi.fn() },
    openExternal: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  Uri: {
    parse: vi.fn((value: string) => ({ value })),
    file: vi.fn((fsPath: string) => ({ fsPath })),
    joinPath: vi.fn(),
  },
}));

const testLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never;

function createTrackedTestSetup(serviceOverrides: Record<string, unknown>) {
  const services = new GitServiceRegistry(serviceOverrides as never);
  const postMessage = vi.fn();
  const sendOperation = vi.fn();
  const context = {
    services,
    postMessage,
    log: {},
    refreshCoordinator: { reload: vi.fn().mockResolvedValue(undefined) },
    telemetry: { sendOperation },
  } as never;
  const router = new WebviewMessageRouter(testLog, context);
  return { router, postMessage, sendOperation };
}

describe('WebviewMessageRouter operation telemetry middleware', () => {
  it('reports success with a duration for tracked operations', async () => {
    const { router, postMessage, sendOperation } = createTrackedTestSetup({
      gitStashService: { applyStash: vi.fn().mockResolvedValue({ success: true, value: 'Applied' }) },
    });

    await router.dispatch({ type: 'applyStash', payload: { index: 0 } });

    expect(sendOperation).toHaveBeenCalledTimes(1);
    expect(sendOperation).toHaveBeenCalledWith('applyStash', 'success', expect.any(Number), undefined);
    expect(postMessage).toHaveBeenCalledWith({ type: 'success', payload: { message: 'Applied' } });
  });

  it('reports error with the standardized code when the handler posts an error response', async () => {
    const { router, sendOperation } = createTrackedTestSetup({
      gitStashService: {
        applyStash: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'COMMAND_FAILED', message: 'stash apply failed on /home/user/repo' },
        }),
      },
    });

    await router.dispatch({ type: 'applyStash', payload: { index: 0 } });

    expect(sendOperation).toHaveBeenCalledWith('applyStash', 'error', expect.any(Number), 'COMMAND_FAILED');
  });

  it('maps out-of-set error codes to UNKNOWN (never free text)', async () => {
    const { router, sendOperation } = createTrackedTestSetup({
      gitStashService: {
        applyStash: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'branch "secret" not found', message: 'oops' },
        }),
      },
    });

    await router.dispatch({ type: 'applyStash', payload: { index: 0 } });

    expect(sendOperation).toHaveBeenCalledWith('applyStash', 'error', expect.any(Number), 'UNKNOWN');
  });

  it('reports error UNKNOWN and rethrows when the handler throws', async () => {
    const { router, sendOperation } = createTrackedTestSetup({
      gitStashService: { applyStash: vi.fn().mockRejectedValue(new Error('boom')) },
    });

    await expect(router.dispatch({ type: 'applyStash', payload: { index: 0 } })).rejects.toThrow('boom');
    expect(sendOperation).toHaveBeenCalledWith('applyStash', 'error', expect.any(Number), 'UNKNOWN');
  });

  it('counts interim domain responses (deleteBranchNeedsForce) as success', async () => {
    const { router, postMessage, sendOperation } = createTrackedTestSetup({
      gitBranchService: {
        deleteBranch: vi.fn().mockResolvedValue({
          success: false,
          error: { code: 'BRANCH_NOT_FULLY_MERGED', message: 'not merged' },
        }),
      },
    });

    await router.dispatch({ type: 'deleteBranch', payload: { name: 'feature' } });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'deleteBranchNeedsForce',
      payload: { name: 'feature', deleteRemote: undefined },
    });
    expect(sendOperation).toHaveBeenCalledWith('deleteBranch', 'success', expect.any(Number), undefined);
  });

  it('sends nothing for untracked request types', async () => {
    const { router, sendOperation } = createTrackedTestSetup({
      gitLogService: { getAuthors: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    });

    await router.dispatch({ type: 'getAuthors', payload: {} });

    expect(sendOperation).not.toHaveBeenCalled();
  });

  it('does not cross-attribute errors between concurrent dispatches', async () => {
    let resolveSlow: (value: unknown) => void = () => {};
    const slowSuccess = new Promise((resolve) => { resolveSlow = resolve; });
    const applyStash = vi.fn()
      .mockImplementationOnce(() => slowSuccess)
      .mockImplementationOnce(() =>
        Promise.resolve({ success: false, error: { code: 'TIMEOUT', message: 'timed out' } }));
    const { router, sendOperation } = createTrackedTestSetup({ gitStashService: { applyStash } });

    const first = router.dispatch({ type: 'applyStash', payload: { index: 0 } });
    const second = router.dispatch({ type: 'applyStash', payload: { index: 1 } });
    await second;
    resolveSlow({ success: true, value: 'Applied' });
    await first;

    const outcomes = sendOperation.mock.calls.map(([, outcome, , code]) => [outcome, code]);
    expect(outcomes).toContainEqual(['error', 'TIMEOUT']);
    expect(outcomes).toContainEqual(['success', undefined]);
    expect(sendOperation).toHaveBeenCalledTimes(2);
  });
});

describe('WebviewMessageRouter', () => {
  it('has a handler for known request types', () => {
    expect(requestHandlers.getAuthors).toBeTypeOf('function');
    expect(requestHandlers.switchRepo).toBeTypeOf('function');
    expect(requestHandlers.openCompareDiff).toBeTypeOf('function');
  });

  it('dispatches through the current service registry entry at request time', async () => {
    const oldGetAuthors = vi.fn().mockResolvedValue({ success: true, value: [] });
    const newGetAuthors = vi.fn().mockResolvedValue({
      success: true,
      value: [{ name: 'Alice', email: 'a@example.com' }],
    });
    const services = new GitServiceRegistry({
      gitLogService: { getAuthors: oldGetAuthors },
    } as never);
    const postMessage = vi.fn();
    const router = new WebviewMessageRouter(
      { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
      { services, postMessage, log: {} } as never,
    );

    services.update({
      gitLogService: { getAuthors: newGetAuthors },
    } as never);

    await router.dispatch({ type: 'getAuthors', payload: {} });

    expect(oldGetAuthors).not.toHaveBeenCalled();
    expect(newGetAuthors).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'authorList',
      payload: { authors: [{ name: 'Alice', email: 'a@example.com' }] },
    });
  });
});
