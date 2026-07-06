import { describe, expect, it, vi } from 'vitest';
import type { Commit } from '../../shared/types.js';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  createDefaultCommitTableLayout,
  DEFAULT_PERSISTED_UI_STATE,
  DEFAULT_USER_SETTINGS,
} from '../../shared/types.js';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';
import { PersistedUIStateStore, repoLayoutKey } from '../webview/PersistedUIStateStore.js';
import { RefreshCoordinator } from '../webview/RefreshCoordinator.js';
import { RepoDataLoader, computeCommitFingerprint } from '../webview/RepoDataLoader.js';
import { WebviewMessageRouter } from '../webview/WebviewMessageRouter.js';
import { WebviewRuntime } from '../webview/WebviewRuntime.js';
import { submoduleHandlers } from '../webview/handlers/submoduleHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';

vi.mock('vscode', () => ({
  window: {},
  workspace: {
    workspaceFolders: [],
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: unknown) => fallback),
    })),
  },
  extensions: {
    getExtension: vi.fn(),
  },
  env: {},
  commands: {},
  Uri: {
    joinPath: vi.fn(),
    from: vi.fn(),
    parse: vi.fn(),
  },
}));

function createUIStateStore(
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
  } as unknown as { globalState: { get: (key: string) => unknown; update: ReturnType<typeof vi.fn> } };

  const store = new PersistedUIStateStore(
    extensionContext as never,
    () => currentRepoPath,
  );

  return { store, extensionContext, globalStateStore };
}

function makeTestCommit(hash: string): Commit {
  return {
    hash,
    abbreviatedHash: hash.slice(0, 7),
    parents: [],
    author: 'Test',
    authorEmail: 'test@example.com',
    authorDate: 0,
    subject: `commit ${hash}`,
    refs: [],
  };
}

function createRepoDataLoaderFixture(options: {
  commits?: Commit[];
  branches?: Array<{ name: string; remote?: string; current: boolean; hash: string }>;
  runtime?: WebviewRuntime;
} = {}) {
  const runtime = options.runtime ?? new WebviewRuntime('/repo-a');
  const commits = options.commits ?? [makeTestCommit('aaa1111')];
  const branches = options.branches ?? [];
  const postMessage = vi.fn();
  const gitLogService = {
    getCommits: vi.fn().mockResolvedValue({
      success: true,
      value: { commits, totalLoadedWithoutFilter: commits.length },
    }),
    getBranches: vi.fn().mockResolvedValue({ success: true, value: branches }),
    getAuthors: vi.fn().mockResolvedValue({ success: true, value: [] }),
  };
  const services = new GitServiceRegistry({
    gitLogService,
    gitDiffService: { getUncommittedSummary: vi.fn().mockResolvedValue({ success: true, value: {
      stagedFiles: [],
      unstagedFiles: [],
      conflictFiles: [],
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
    } }) },
    gitRemoteService: { getRemotes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitWorktreeService: { listWorktrees: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitStashService: { getStashes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitRevertService: { getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'idle' }) },
    gitTagService: { getTagMetadata: vi.fn().mockResolvedValue({ success: true, value: [] }) },
    gitCherryPickService: { getCherryPickState: vi.fn(() => ({ success: true, value: 'idle' })) },
    gitRebaseService: {
      getRebaseState: vi.fn(() => ({ success: true, value: { state: 'idle' } })),
      getConflictInfo: vi.fn(),
    },
    gitSubmoduleService: {
      getSubmodules: vi.fn().mockResolvedValue({ success: true, value: [] }),
    },
  } as never);
  const { store } = createUIStateStore();
  const dataLoader = new RepoDataLoader({
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    runtime,
    services,
    uiStateStore: store,
    postMessage,
    getSettings: () => ({ ...DEFAULT_USER_SETTINGS, avatarsEnabled: false }),
    getBatchSize: () => 500,
    getSubmoduleHandlers: () => undefined,
  });

  return { dataLoader, runtime, services, postMessage, gitLogService, commits };
}

describe('WebviewProvider initial load performance', () => {
  it('posts initialData without waiting for deferred repo data or authors', async () => {
    const deferredUncommitted = new Promise<never>(() => undefined);
    const commit = makeTestCommit('aaa1111');
    const runtime = new WebviewRuntime('/repo-a');
    const postMessage = vi.fn();

    const gitLogService = {
      getCommits: vi.fn().mockResolvedValue({
        success: true,
        value: { commits: [commit], totalLoadedWithoutFilter: 1 },
      }),
      getBranches: vi.fn().mockResolvedValue({ success: true, value: [] }),
      getAuthors: vi.fn().mockResolvedValue({ success: true, value: [] }),
    };

    const services = new GitServiceRegistry({
      gitLogService,
      gitDiffService: { getUncommittedSummary: vi.fn(() => deferredUncommitted) },
      gitRemoteService: { getRemotes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
      gitWorktreeService: { listWorktrees: vi.fn().mockResolvedValue({ success: true, value: [] }) },
      gitStashService: { getStashes: vi.fn().mockResolvedValue({ success: true, value: [] }) },
      gitRevertService: { getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'idle' }) },
      gitTagService: { getTagMetadata: vi.fn().mockResolvedValue({ success: true, value: [] }) },
      gitCherryPickService: { getCherryPickState: vi.fn(() => ({ success: true, value: 'idle' })) },
      gitRebaseService: {
        getRebaseState: vi.fn(() => ({ success: true, value: { state: 'idle' } })),
        getConflictInfo: vi.fn(),
      },
      gitSubmoduleService: {
        getSubmodules: vi.fn().mockResolvedValue({ success: true, value: [] }),
      },
    } as never);
    const { store } = createUIStateStore();
    const dataLoader = new RepoDataLoader({
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
      runtime,
      services,
      uiStateStore: store,
      postMessage,
      getSettings: () => ({ ...DEFAULT_USER_SETTINGS, avatarsEnabled: false }),
      getBatchSize: () => 500,
      getSubmoduleHandlers: () => undefined,
    });

    await dataLoader.sendInitialData();

    expect(gitLogService.getAuthors).not.toHaveBeenCalled();
    expect(services.current().gitDiffService.getUncommittedSummary).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initialData',
      payload: expect.objectContaining({
        commits: [commit],
        branches: [],
        authors: [],
        remotes: [],
        stashes: [],
        worktrees: [],
      }),
    }));
  });
});

describe('RepoDataLoader refresh behavior', () => {
  it('uses commits=null on auto-refresh when the commit fingerprint is unchanged', async () => {
    const commit = makeTestCommit('aaa1111');
    const runtime = new WebviewRuntime('/repo-a');
    runtime.initialLoadSent = true;
    runtime.lastCommitFingerprint = computeCommitFingerprint([commit]);
    runtime.isDisplayingSubmodule = true;
    const { dataLoader, postMessage } = createRepoDataLoaderFixture({
      commits: [commit],
      runtime,
    });

    await dataLoader.sendInitialData(undefined, true);

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'initialData',
      payload: expect.objectContaining({ commits: null }),
    }));
  });

  it('removes missing branch filters before fetching commits', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['main', 'missing'], maxCount: 250 };
    runtime.isDisplayingSubmodule = true;
    const { dataLoader, gitLogService } = createRepoDataLoaderFixture({
      runtime,
      branches: [{ name: 'main', current: true, hash: 'aaa1111' }],
    });

    await dataLoader.sendInitialData();

    expect(gitLogService.getCommits).toHaveBeenCalledWith(expect.objectContaining({
      branches: ['main'],
      maxCount: 500,
    }));
    expect(runtime.currentFilters.branches).toEqual(['main']);
  });
});

describe('RefreshCoordinator', () => {
  it('defers auto-refresh while hidden and runs it when visible', async () => {
    const dataLoader = {
      sendInitialData: vi.fn().mockResolvedValue(undefined),
    };
    const coordinator = new RefreshCoordinator(
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
      dataLoader as never,
    );

    await coordinator.triggerAutoRefresh();
    expect(dataLoader.sendInitialData).not.toHaveBeenCalled();

    coordinator.setPanelVisible(true);
    await vi.waitFor(() => {
      expect(dataLoader.sendInitialData).toHaveBeenCalledWith(undefined, true);
    });
  });
});

describe('WebviewMessageRouter', () => {
  it('dispatches through the current service registry entry at request time', async () => {
    const oldGetAuthors = vi.fn().mockResolvedValue({ success: true, value: [] });
    const newGetAuthors = vi.fn().mockResolvedValue({ success: true, value: [{ name: 'Alice', email: 'a@example.com' }] });
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

describe('WebviewProvider switchRepo', () => {
  it('clears remembered branch filters before reloading the new repository', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature/test'], author: 'Alice', maxCount: 250 };
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
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('displayRepo marks submodule display without changing the active repo list', async () => {
    const runtime = new WebviewRuntime('/repo-a');
    runtime.currentFilters = { branches: ['feature/test'], maxCount: 250 };
    const reload = vi.fn().mockResolvedValue(undefined);
    const context = {
      runtime,
      refreshCoordinator: { reload },
      getRepoDiscovery: () => ({
        getActiveRepoPath: () => '/repo-a',
      }),
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

describe('WebviewProvider per-repo column layout', () => {
  it('loads default layout when no per-repo layout is saved', () => {
    const { store } = createUIStateStore();

    const state = store.loadPersistedUIState();
    expect(state.commitTableLayout).toEqual(createDefaultCommitTableLayout());
  });

  it('loads per-repo layout from globalState keyed by repo path', () => {
    const customLayout = createDefaultCommitTableLayout();
    customLayout.columns.message.preferredWidth = 600;
    customLayout.columns.hash.visible = false;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: customLayout,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(600);
    expect(state.commitTableLayout.columns.hash.visible).toBe(false);
  });

  it('saves commitTableLayout to per-repo key, not global state', () => {
    const store: Record<string, unknown> = {};
    const { store: uiStateStore, extensionContext } = createUIStateStore(store, '/repo-a');

    const updatedLayout = createDefaultCommitTableLayout();
    updatedLayout.columns.author.preferredWidth = 200;

    uiStateStore.savePersistedUIState({ commitTableLayout: updatedLayout });

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

  it('saves global UI state without the per-repo table layout', () => {
    const store: Record<string, unknown> = {};
    const { store: uiStateStore, extensionContext } = createUIStateStore(store, '/repo-a');

    uiStateStore.savePersistedUIState({ detailsPanelPosition: 'right' });

    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      'speedyGit.uiState',
      expect.objectContaining({ detailsPanelPosition: 'right' }),
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
    let currentRepoPath = '/repo-a';
    const { store: uiStateStore } = createUIStateStore(store, currentRepoPath);
    const repoAwareStore = new PersistedUIStateStore(
      {
        globalState: {
          get: vi.fn((key: string) => store[key]),
          update: vi.fn(),
        },
      } as never,
      () => currentRepoPath,
    );

    // Load repo-a layout
    const stateA = repoAwareStore.loadPersistedUIState();
    expect(stateA.commitTableLayout.columns.message.preferredWidth).toBe(500);

    // Switch to repo-b by simulating reinitializeServices cache clearing
    currentRepoPath = '/repo-b';
    repoAwareStore.invalidateCache();

    // Load repo-b layout
    const stateB = repoAwareStore.loadPersistedUIState();
    expect(stateB.commitTableLayout.columns.message.preferredWidth).toBe(300);
    expect(uiStateStore).toBeDefined();
  });

});

describe('WebviewProvider validateCommitTableLayout healing', () => {
  // The backend "heals" persisted widths so a column whose stored preferredWidth
  // would push neighbours below their minimum cannot make the layout
  // unrecoverable. Healing happens lazily when the layout is loaded.
  const HEALING_ASSUMED_CONTAINER_WIDTH = 4000;
  const SUM_OF_ALL_MIN_WIDTHS = Object.values(COMMIT_TABLE_MIN_WIDTHS).reduce(
    (sum, w) => sum + w,
    0,
  );

  it('clamps an absurdly large persisted preferredWidth to a healing ceiling', () => {
    const layout = createDefaultCommitTableLayout();
    // 10x bigger than any realistic monitor width.
    layout.columns.message.preferredWidth = 100_000;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layout,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    const healed = state.commitTableLayout.columns.message.preferredWidth;
    const expectedCeiling =
      HEALING_ASSUMED_CONTAINER_WIDTH
      - (SUM_OF_ALL_MIN_WIDTHS - COMMIT_TABLE_MIN_WIDTHS.message);
    expect(healed).toBe(expectedCeiling);
  });

  it('clamps a persisted preferredWidth below the min up to the min', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.author.preferredWidth = 5;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layout,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    expect(state.commitTableLayout.columns.author.preferredWidth).toBe(
      COMMIT_TABLE_MIN_WIDTHS.author,
    );
  });

  it('rounds fractional persisted widths and preserves in-range values', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.hash.preferredWidth = 123.7;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layout,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    expect(state.commitTableLayout.columns.hash.preferredWidth).toBe(124);
  });

  it('keeps a reasonable persisted preferredWidth unchanged', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.message.preferredWidth = 600;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layout,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(600);
  });

  it('falls back to default preferredWidth when stored value is NaN', () => {
    const layout = createDefaultCommitTableLayout();
    const malformed = {
      ...layout,
      columns: {
        ...layout.columns,
        date: { visible: true, preferredWidth: Number.NaN },
      },
    };

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: malformed,
    };
    const { store: uiStateStore } = createUIStateStore(store, '/repo-a');

    const state = uiStateStore.loadPersistedUIState();
    expect(state.commitTableLayout.columns.date.preferredWidth).toBe(
      DEFAULT_PERSISTED_UI_STATE.commitTableLayout.columns.date.preferredWidth,
    );
  });
});

describe('WebviewProvider computeCommitFingerprint', () => {
  function makeCommit(hash: string, refs: Commit['refs'] = []): Commit {
    return {
      hash,
      abbreviatedHash: hash.slice(0, 7),
      parents: [],
      author: 'Test',
      authorEmail: 'test@example.com',
      authorDate: 0,
      subject: `commit ${hash}`,
      refs,
    };
  }

  function fingerprint(commits: Commit[]): string {
    return computeCommitFingerprint(commits);
  }

  it('returns empty string for empty commit list', () => {
    expect(fingerprint([])).toBe('');
  });

  it('produces identical fingerprint for identical commits with identical refs', () => {
    const refs: Commit['refs'] = [{ name: 'main', type: 'branch' }];
    const a = [makeCommit('aaa', refs), makeCommit('bbb')];
    const b = [makeCommit('aaa', [{ name: 'main', type: 'branch' }]), makeCommit('bbb')];
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('changes fingerprint when commit hashes change', () => {
    const a = [makeCommit('aaa'), makeCommit('bbb')];
    const b = [makeCommit('aaa'), makeCommit('ccc')];
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  // Regression: creating a new branch (or any ref-only change) must bust the
  // fingerprint so the webview receives fresh commits with up-to-date `refs`.
  // Without this, the auto-refresh sends `commits=null` and the new branch
  // label never appears in the graph until a manual refresh.
  it('changes fingerprint when a branch ref is added to a commit (no hash change)', () => {
    const before = [
      makeCommit('aaa', [{ name: 'main', type: 'branch' }]),
      makeCommit('bbb'),
    ];
    const after = [
      makeCommit('aaa', [
        { name: 'main', type: 'branch' },
        { name: 'feature/new', type: 'branch' },
      ]),
      makeCommit('bbb'),
    ];
    expect(fingerprint(before)).not.toBe(fingerprint(after));
  });

  it('changes fingerprint when a branch ref is removed from a commit', () => {
    const before = [
      makeCommit('aaa', [
        { name: 'main', type: 'branch' },
        { name: 'old-branch', type: 'branch' },
      ]),
    ];
    const after = [makeCommit('aaa', [{ name: 'main', type: 'branch' }])];
    expect(fingerprint(before)).not.toBe(fingerprint(after));
  });

  it('changes fingerprint when HEAD moves to a different commit (no hash change)', () => {
    const before = [
      makeCommit('aaa', [{ name: 'HEAD', type: 'head' }, { name: 'main', type: 'branch' }]),
      makeCommit('bbb', [{ name: 'feature', type: 'branch' }]),
    ];
    const after = [
      makeCommit('aaa', [{ name: 'main', type: 'branch' }]),
      makeCommit('bbb', [{ name: 'HEAD', type: 'head' }, { name: 'feature', type: 'branch' }]),
    ];
    expect(fingerprint(before)).not.toBe(fingerprint(after));
  });

  it('changes fingerprint when a tag is added to a commit', () => {
    const before = [makeCommit('aaa', [{ name: 'main', type: 'branch' }])];
    const after = [
      makeCommit('aaa', [
        { name: 'main', type: 'branch' },
        { name: 'v1.0.0', type: 'tag' },
      ]),
    ];
    expect(fingerprint(before)).not.toBe(fingerprint(after));
  });

  it('distinguishes refs with the same name but different remotes', () => {
    const a = [makeCommit('aaa', [{ name: 'main', type: 'remote', remote: 'origin' }])];
    const b = [makeCommit('aaa', [{ name: 'main', type: 'remote', remote: 'upstream' }])];
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});
