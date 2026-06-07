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
