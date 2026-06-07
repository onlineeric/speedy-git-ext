import { describe, expect, it, vi } from 'vitest';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import { submoduleHandlers } from '../webview/handlers/submoduleHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';

describe('submoduleHandlers', () => {
  it('switchRepo rejects unknown workspace repos', async () => {
    const context = {
      runtime: new WebviewRuntime('/repo-a'),
      getRepoDiscovery: () => ({
        getRepos: () => [{ path: '/repo-a', name: 'repo-a', displayName: 'repo-a' }],
        getActiveRepoPath: () => '/repo-a',
      }),
      postMessage: vi.fn(),
      onSwitchRepo: vi.fn(),
    } as unknown as WebviewRequestContext;

    await submoduleHandlers.switchRepo({
      type: 'switchRepo',
      payload: { repoPath: '/missing' },
    }, context);

    expect(context.onSwitchRepo).not.toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { error: { message: 'Repository not found: /missing' } },
    });
  });

  it('switchRepo clears filters, resets submodule display, and reloads', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature'], author: 'Alice', maxCount: 250 };
    runtime.isDisplayingSubmodule = true;
    const reload = vi.fn().mockResolvedValue(undefined);
    const context = {
      runtime,
      refreshCoordinator: { reload },
      getRepoDiscovery: () => ({
        getRepos: () => [
          { path: '/repo-a', name: 'repo-a', displayName: 'repo-a' },
          { path: '/repo-b', name: 'repo-b', displayName: 'repo-b' },
        ],
        getActiveRepoPath: () => '/repo-b',
      }),
      onSwitchRepo: vi.fn(),
      sendRepoList: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as WebviewRequestContext;

    await submoduleHandlers.switchRepo({
      type: 'switchRepo',
      payload: { repoPath: '/repo-b' },
    }, context);

    expect(runtime.currentFilters).toEqual({ maxCount: 250 });
    expect(runtime.isDisplayingSubmodule).toBe(false);
    expect(context.onSwitchRepo).toHaveBeenCalledWith('/repo-b');
    expect(context.sendRepoList).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('displayRepo marks submodule display without active repo validation', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature'], maxCount: 250 };
    const reload = vi.fn().mockResolvedValue(undefined);
    const context = {
      runtime,
      refreshCoordinator: { reload },
      getRepoDiscovery: () => ({ getActiveRepoPath: () => '/repo-a' }),
      onDisplayRepo: vi.fn(),
      postMessage: vi.fn(),
    } as unknown as WebviewRequestContext;

    await submoduleHandlers.displayRepo({
      type: 'displayRepo',
      payload: { repoPath: '/repo-a/submodule' },
    }, context);

    expect(runtime.isDisplayingSubmodule).toBe(true);
    expect(runtime.currentFilters).toEqual({ maxCount: 250 });
    expect(context.onDisplayRepo).toHaveBeenCalledWith('/repo-a/submodule');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
