import { describe, expect, it, vi } from 'vitest';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import { submoduleHandlers } from '../webview/handlers/submoduleHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';

const REPOS = [
  { path: '/repo-a', name: 'repo-a', displayName: 'repo-a' },
  { path: '/repo-b', name: 'repo-b', displayName: 'repo-b' },
];

/** A context whose repo-changing methods advance the runtime's generation, as a real tab's do. */
function createContext(runtime: WebviewRuntime, overrides: Partial<WebviewRequestContext> = {}) {
  return {
    runtime,
    refreshCoordinator: { reload: vi.fn().mockResolvedValue(undefined) },
    getRepoDiscovery: () => ({
      getRepos: () => REPOS,
      getActiveRepoPath: () => '/repo-a',
    }),
    getTopLevelRepoPath: () => runtime.topLevelRepoPath,
    setTopLevelRepo: vi.fn(async (repoPath: string) => {
      runtime.topLevelRepoPath = repoPath;
      runtime.isDisplayingSubmodule = false;
      return runtime.beginNavigation();
    }),
    setDisplayedRepo: vi.fn(async (repoPath: string) => {
      runtime.currentRepoPath = repoPath;
      return runtime.beginNavigation();
    }),
    backToParentRepo: vi.fn().mockResolvedValue(undefined),
    pushSubmoduleEntry: vi.fn(),
    sendRepoList: vi.fn(),
    postMessage: vi.fn(),
    ...overrides,
  } as unknown as WebviewRequestContext;
}

describe('submoduleHandlers', () => {
  it('switchRepo rejects unknown workspace repos', async () => {
    const context = createContext(new WebviewRuntime('/repo-a'));

    await submoduleHandlers.switchRepo({ type: 'switchRepo', payload: { repoPath: '/missing' } }, context);

    expect(context.setTopLevelRepo).not.toHaveBeenCalled();
    expect(context.postMessage).toHaveBeenCalledWith({
      type: 'error',
      payload: { error: { message: 'Repository not found: /missing' } },
    });
  });

  it('switchRepo clears filters, resets submodule display, and reloads', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature'], author: 'Alice', maxCount: 250 };
    runtime.isDisplayingSubmodule = true;
    const context = createContext(runtime);

    await submoduleHandlers.switchRepo({ type: 'switchRepo', payload: { repoPath: '/repo-b' } }, context);

    expect(runtime.currentFilters).toEqual({ maxCount: 250 });
    expect(runtime.isDisplayingSubmodule).toBe(false);
    expect(context.setTopLevelRepo).toHaveBeenCalledWith('/repo-b');
    expect(context.sendRepoList).toHaveBeenCalled();
    expect(context.refreshCoordinator.reload).toHaveBeenCalledTimes(1);
  });

  it('switchRepo sends only THIS tab its repo list — no peer is notified', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    const context = createContext(runtime);

    await submoduleHandlers.switchRepo({ type: 'switchRepo', payload: { repoPath: '/repo-b' } }, context);

    // `sendRepoList` takes no arguments: it can only ever address its own tab.
    expect(context.sendRepoList).toHaveBeenCalledWith();
  });

  it('displayRepo marks submodule display without touching the top-level repo', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature'], maxCount: 250 };
    const context = createContext(runtime);

    await submoduleHandlers.displayRepo(
      { type: 'displayRepo', payload: { repoPath: '/repo-a/submodule' } },
      context,
    );

    expect(runtime.isDisplayingSubmodule).toBe(true);
    expect(runtime.topLevelRepoPath).toBe('/repo-a');
    expect(runtime.currentFilters).toEqual({ maxCount: 250 });
    expect(context.setDisplayedRepo).toHaveBeenCalledWith('/repo-a/submodule');
    expect(context.setTopLevelRepo).not.toHaveBeenCalled();
    expect(context.refreshCoordinator.reload).toHaveBeenCalledTimes(1);
  });

  it('displayRepo of the top-level repo itself clears the submodule marker', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.isDisplayingSubmodule = true;
    const context = createContext(runtime);

    await submoduleHandlers.displayRepo({ type: 'displayRepo', payload: { repoPath: '/repo-a' } }, context);

    expect(runtime.isDisplayingSubmodule).toBe(false);
  });

  it('openSubmodule records where it came from, so "back" can unwind it', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    const context = createContext(runtime);

    await submoduleHandlers.openSubmodule(
      { type: 'openSubmodule', payload: { submodulePath: 'sub' } },
      context,
    );

    expect(context.pushSubmoduleEntry).toHaveBeenCalledWith({ repoPath: '/repo-a', repoName: 'repo-a' });
    expect(context.setDisplayedRepo).toHaveBeenCalledWith('/repo-a/sub');
    expect(runtime.isDisplayingSubmodule).toBe(true);
  });

  it('a navigation overtaken by a later one does not reload', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    const context = createContext(runtime, {
      setDisplayedRepo: vi.fn(async () => {
        const generation = runtime.beginNavigation();
        // A second navigation starts before this one finishes.
        runtime.beginNavigation();
        return generation;
      }),
    });

    await submoduleHandlers.displayRepo(
      { type: 'displayRepo', payload: { repoPath: '/repo-a/submodule' } },
      context,
    );

    expect(context.refreshCoordinator.reload).not.toHaveBeenCalled();
  });
});
