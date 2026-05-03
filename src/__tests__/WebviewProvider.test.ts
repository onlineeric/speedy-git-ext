import * as crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultCommitTableLayout, DEFAULT_PERSISTED_UI_STATE } from '../../shared/types.js';
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

function repoLayoutKey(repoPath: string): string {
  const hash = crypto.createHash('sha256').update(repoPath).digest('hex').slice(0, 16);
  return `speedyGit.repoTableLayout.${hash}`;
}

function createProvider(
  globalStateStore: Record<string, unknown> = {},
  currentRepoPath = '/repo-a',
) {
  const extensionContext = {
    globalState: {
      get: vi.fn((key: string) => globalStateStore[key]),
      update: vi.fn((key: string, value: unknown) => {
        globalStateStore[key] = value;
        return Promise.resolve();
      }),
    },
    extensionUri: {},
  } as unknown as ConstructorParameters<typeof WebviewProvider>[0];
  const emptyDependency = {} as unknown;
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as ConstructorParameters<typeof WebviewProvider>[15];
  const repoDiscovery = {
    getRepos: () => [
      { path: '/repo-a', name: 'repo-a', displayName: 'repo-a' },
      { path: '/repo-b', name: 'repo-b', displayName: 'repo-b' },
    ],
    getActiveRepoPath: () => currentRepoPath,
  } as unknown as ConstructorParameters<typeof WebviewProvider>[16];

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
    emptyDependency as ConstructorParameters<typeof WebviewProvider>[14],
    log,
    repoDiscovery,
    currentRepoPath,
  );

  return { provider, extensionContext, globalStateStore };
}

describe('WebviewProvider switchRepo', () => {
  it('clears remembered branch filters before reloading the new repository', async () => {
    const { provider } = createProvider();

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
    expect(testableProvider.sendInitialData).toHaveBeenCalledTimes(1);
    expect(testableProvider.sendInitialData).toHaveBeenCalledWith();
  });
});

describe('WebviewProvider per-repo column layout', () => {
  it('loads default layout when no per-repo layout is saved', () => {
    const { provider } = createProvider();

    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
    expect(state.commitTableLayout).toEqual(createDefaultCommitTableLayout());
  });

  it('loads per-repo layout from globalState keyed by repo path', () => {
    const customLayout = createDefaultCommitTableLayout();
    customLayout.columns.message.preferredWidth = 600;
    customLayout.columns.hash.visible = false;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: customLayout,
    };
    const { provider } = createProvider(store, '/repo-a');

    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(600);
    expect(state.commitTableLayout.columns.hash.visible).toBe(false);
  });

  it('saves commitTableLayout to per-repo key, not global state', () => {
    const store: Record<string, unknown> = {};
    const { provider, extensionContext } = createProvider(store, '/repo-a');

    const testable = provider as unknown as {
      savePersistedUIState: (partial: Partial<Record<string, unknown>>) => void;
    };

    const updatedLayout = createDefaultCommitTableLayout();
    updatedLayout.columns.author.preferredWidth = 200;

    testable.savePersistedUIState({ commitTableLayout: updatedLayout });

    // Per-repo key should have the layout
    const repoKey = repoLayoutKey('/repo-a');
    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      repoKey,
      expect.objectContaining({
        columns: expect.objectContaining({
          author: expect.objectContaining({ preferredWidth: 200 }),
        }),
      }),
    );
  });

  it('saves commitListMode to global state (not per-repo)', () => {
    const store: Record<string, unknown> = {};
    const { provider, extensionContext } = createProvider(store, '/repo-a');

    const testable = provider as unknown as {
      savePersistedUIState: (partial: Partial<Record<string, unknown>>) => void;
    };

    testable.savePersistedUIState({ commitListMode: 'classic' });

    // Global state key should be updated with commitListMode
    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      'speedyGit.uiState',
      expect.objectContaining({ commitListMode: 'classic' }),
    );

    // Global state should NOT contain commitTableLayout
    const globalCall = (extensionContext.globalState.update as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'speedyGit.uiState'
    );
    expect(globalCall).toBeDefined();
    expect(globalCall![1]).not.toHaveProperty('commitTableLayout');
  });

  it('loads different layouts for different repos after reinitializeServices', () => {
    const layoutA = createDefaultCommitTableLayout();
    layoutA.columns.message.preferredWidth = 500;

    const layoutB = createDefaultCommitTableLayout();
    layoutB.columns.message.preferredWidth = 300;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layoutA,
      [repoLayoutKey('/repo-b')]: layoutB,
    };
    const { provider } = createProvider(store, '/repo-a');

    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
      reinitializeServices: (...args: unknown[]) => void;
      currentRepoPath: string;
      uiStateCache: unknown;
    };

    // Load repo-a layout
    const stateA = testable.loadPersistedUIState();
    expect(stateA.commitTableLayout.columns.message.preferredWidth).toBe(500);

    // Switch to repo-b by simulating reinitializeServices cache clearing
    testable.currentRepoPath = '/repo-b';
    testable.uiStateCache = undefined;

    // Load repo-b layout
    const stateB = testable.loadPersistedUIState();
    expect(stateB.commitTableLayout.columns.message.preferredWidth).toBe(300);
  });

  it('defaults commitListMode to table for new users', () => {
    const { provider } = createProvider();

    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
    expect(state.commitListMode).toBe('table');
  });
});
