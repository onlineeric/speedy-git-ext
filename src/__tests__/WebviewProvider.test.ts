import { describe, expect, it, vi } from 'vitest';
import { WebviewProvider } from '../WebviewProvider.js';

vi.mock('vscode', () => ({
  window: {},
  workspace: {
    workspaceFolders: [],
  },
  env: {},
  commands: {},
  Uri: {
    joinPath: vi.fn(),
    from: vi.fn(),
    parse: vi.fn(),
  },
}));

describe('WebviewProvider switchRepo', () => {
  it('clears remembered branch filters before reloading the new repository', async () => {
    const provider = new WebviewProvider(
      {
        globalState: {
          get: vi.fn(() => undefined),
          update: vi.fn(),
        },
        extensionUri: {},
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any,
      {
        getRepos: () => [
          { path: '/repo-a', name: 'repo-a', displayName: 'repo-a' },
          { path: '/repo-b', name: 'repo-b', displayName: 'repo-b' },
        ],
        getActiveRepoPath: () => '/repo-b',
      } as any,
      '/repo-a',
    );

    provider.setSwitchRepoHandler(vi.fn());
    (provider as any).sendInitialData = vi.fn().mockResolvedValue(undefined);
    (provider as any).sendRepoList = vi.fn();
    (provider as any).currentFilters = { branches: ['feature/test'], author: 'Alice', maxCount: 250 };

    await (provider as any).handleMessage({
      type: 'switchRepo',
      payload: { repoPath: '/repo-b' },
    });

    expect((provider as any).currentFilters).toEqual({ maxCount: 250 });
    expect((provider as any).sendInitialData).toHaveBeenCalledWith(undefined, true);
  });
});
