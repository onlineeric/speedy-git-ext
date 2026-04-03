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
    const extensionContext = {
      globalState: {
        get: vi.fn(() => undefined),
        update: vi.fn(),
      },
      extensionUri: {},
    } as unknown as ConstructorParameters<typeof WebviewProvider>[0];
    const emptyDependency = {} as unknown;
    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as ConstructorParameters<typeof WebviewProvider>[14];
    const repoDiscovery = {
      getRepos: () => [
        { path: '/repo-a', name: 'repo-a', displayName: 'repo-a' },
        { path: '/repo-b', name: 'repo-b', displayName: 'repo-b' },
      ],
      getActiveRepoPath: () => '/repo-b',
    } as unknown as ConstructorParameters<typeof WebviewProvider>[15];

    const provider = new WebviewProvider(
      extensionContext,
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[1],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[2],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[3],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[4],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[5],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[6],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[7],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[8],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[9],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[10],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[11],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[12],
      emptyDependency as ConstructorParameters<typeof WebviewProvider>[13],
      log,
      repoDiscovery,
      '/repo-a',
    );

    const testableProvider = provider as unknown as {
      sendInitialData: ReturnType<typeof vi.fn>;
      sendRepoList: ReturnType<typeof vi.fn>;
      currentFilters: { branches?: string[]; author?: string; maxCount: number };
      handleMessage: (message: { type: 'switchRepo'; payload: { repoPath: string } }) => Promise<void>;
    };

    provider.setSwitchRepoHandler(vi.fn());
    testableProvider.sendInitialData = vi.fn().mockResolvedValue(undefined);
    testableProvider.sendRepoList = vi.fn();
    testableProvider.currentFilters = { branches: ['feature/test'], author: 'Alice', maxCount: 250 };

    await testableProvider.handleMessage({
      type: 'switchRepo',
      payload: { repoPath: '/repo-b' },
    });

    expect(testableProvider.currentFilters).toEqual({ maxCount: 250 });
    expect(testableProvider.sendInitialData).toHaveBeenCalledWith(undefined, true);
  });
});
