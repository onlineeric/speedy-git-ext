import * as crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Commit } from '../../shared/types.js';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  createDefaultCommitTableLayout,
  DEFAULT_PERSISTED_UI_STATE,
  DEFAULT_USER_SETTINGS,
} from '../../shared/types.js';
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

describe('WebviewProvider initial load performance', () => {
  it('posts initialData without waiting for deferred repo data or authors', async () => {
    const { provider } = createProvider();
    const deferredUncommitted = new Promise<never>(() => undefined);
    const commit = makeTestCommit('aaa1111');

    const gitLogService = {
      getCommits: vi.fn().mockResolvedValue({
        success: true,
        value: { commits: [commit], totalLoadedWithoutFilter: 1 },
      }),
      getBranches: vi.fn().mockResolvedValue({ success: true, value: [] }),
      getAuthors: vi.fn().mockResolvedValue({ success: true, value: [] }),
    };

    const testable = provider as unknown as {
      postMessage: ReturnType<typeof vi.fn>;
      sendInitialData: () => Promise<void>;
      sendSubmodulesData: ReturnType<typeof vi.fn>;
      gitLogService: typeof gitLogService;
      gitDiffService: { getUncommittedSummary: ReturnType<typeof vi.fn> };
      gitRemoteService: { getRemotes: ReturnType<typeof vi.fn> };
      gitWorktreeService: { listWorktrees: ReturnType<typeof vi.fn> };
      gitStashService: { getStashes: ReturnType<typeof vi.fn> };
      gitRevertService: { getRevertState: ReturnType<typeof vi.fn> };
      gitCherryPickService: { getCherryPickState: ReturnType<typeof vi.fn> };
      gitRebaseService: { getRebaseState: ReturnType<typeof vi.fn>; getConflictInfo: ReturnType<typeof vi.fn> };
    };

    testable.postMessage = vi.fn();
    testable.sendSubmodulesData = vi.fn();
    testable.gitLogService = gitLogService;
    testable.gitDiffService = { getUncommittedSummary: vi.fn(() => deferredUncommitted) };
    testable.gitRemoteService = { getRemotes: vi.fn().mockResolvedValue({ success: true, value: [] }) };
    testable.gitWorktreeService = { listWorktrees: vi.fn().mockResolvedValue({ success: true, value: [] }) };
    testable.gitStashService = { getStashes: vi.fn().mockResolvedValue({ success: true, value: [] }) };
    testable.gitRevertService = { getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'idle' }) };
    testable.gitCherryPickService = { getCherryPickState: vi.fn(() => ({ success: true, value: 'idle' })) };
    testable.gitRebaseService = {
      getRebaseState: vi.fn(() => ({ success: true, value: { state: 'idle' } })),
      getConflictInfo: vi.fn(),
    };
    provider.setSettingsProvider(() => ({ ...DEFAULT_USER_SETTINGS, avatarsEnabled: false }));

    await testable.sendInitialData();

    expect(testable.gitLogService.getAuthors).not.toHaveBeenCalled();
    expect(testable.gitDiffService.getUncommittedSummary).toHaveBeenCalledTimes(1);
    expect(testable.postMessage).toHaveBeenCalledWith(expect.objectContaining({
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
    const { provider } = createProvider(store, '/repo-a');
    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
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
    const { provider } = createProvider(store, '/repo-a');
    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
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
    const { provider } = createProvider(store, '/repo-a');
    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
    expect(state.commitTableLayout.columns.hash.preferredWidth).toBe(124);
  });

  it('keeps a reasonable persisted preferredWidth unchanged', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.message.preferredWidth = 600;

    const store: Record<string, unknown> = {
      [repoLayoutKey('/repo-a')]: layout,
    };
    const { provider } = createProvider(store, '/repo-a');
    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
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
    const { provider } = createProvider(store, '/repo-a');
    const testable = provider as unknown as {
      loadPersistedUIState: () => typeof DEFAULT_PERSISTED_UI_STATE;
    };

    const state = testable.loadPersistedUIState();
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
    const { provider } = createProvider();
    const testable = provider as unknown as {
      computeCommitFingerprint: (commits: Commit[]) => string;
    };
    return testable.computeCommitFingerprint(commits);
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
