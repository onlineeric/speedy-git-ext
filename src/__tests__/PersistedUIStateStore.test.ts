import { describe, expect, it, vi } from 'vitest';
import {
  COMMIT_TABLE_MIN_WIDTHS,
  DEFAULT_PERSISTED_UI_STATE,
  createDefaultCommitTableLayout,
} from '../../shared/types.js';
import {
  HEALING_ASSUMED_CONTAINER_WIDTH,
  PersistedUIStateStore,
  repoLayoutKey,
} from '../webview/PersistedUIStateStore.js';

function createStore(
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
  };
  const store = new PersistedUIStateStore(extensionContext as never, () => currentRepoPath);
  return { store, extensionContext };
}

describe('PersistedUIStateStore', () => {
  it('loads global UI state with per-repo table layout', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.message.preferredWidth = 600;
    const { store } = createStore({
      'speedyGit.uiState': {
        ...DEFAULT_PERSISTED_UI_STATE,
        detailsPanelPosition: 'right',
      },
      [repoLayoutKey('/repo-a')]: layout,
    });

    const state = store.loadPersistedUIState();

    expect(state.detailsPanelPosition).toBe('right');
    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(600);
  });

  it('ignores a legacy commitListMode key persisted by versions that had the Classic view', () => {
    const { store, extensionContext } = createStore({
      'speedyGit.uiState': {
        ...DEFAULT_PERSISTED_UI_STATE,
        commitListMode: 'classic',
      },
    });

    const state = store.loadPersistedUIState();

    expect(state).not.toHaveProperty('commitListMode');
    expect(state.version).toBe(DEFAULT_PERSISTED_UI_STATE.version);
    expect(state.detailsPanelPosition).toBe(DEFAULT_PERSISTED_UI_STATE.detailsPanelPosition);

    // The next save rewrites global state without the stale key.
    store.savePersistedUIState({ detailsPanelPosition: 'right' });
    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      'speedyGit.uiState',
      expect.not.objectContaining({ commitListMode: expect.anything() }),
    );
  });

  it('saves table layout to the repo key and leaves global state layout-free', () => {
    const { store, extensionContext } = createStore({}, '/repo-a');
    const layout = createDefaultCommitTableLayout();
    layout.columns.author.preferredWidth = 220;

    store.savePersistedUIState({
      detailsPanelPosition: 'right',
      commitTableLayout: layout,
    });

    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      repoLayoutKey('/repo-a'),
      expect.objectContaining({
        columns: expect.objectContaining({
          author: expect.objectContaining({ preferredWidth: 220 }),
        }),
      }),
    );
    expect(extensionContext.globalState.update).toHaveBeenCalledWith(
      'speedyGit.uiState',
      expect.not.objectContaining({ commitTableLayout: expect.anything() }),
    );
  });

  it('invalidates the cache so a new repo layout can be loaded', () => {
    let currentRepoPath = '/repo-a';
    const layoutA = createDefaultCommitTableLayout();
    layoutA.columns.message.preferredWidth = 500;
    const layoutB = createDefaultCommitTableLayout();
    layoutB.columns.message.preferredWidth = 300;
    const { store } = createStore({
      [repoLayoutKey('/repo-a')]: layoutA,
      [repoLayoutKey('/repo-b')]: layoutB,
    }, currentRepoPath);
    const repoAwareStore = new PersistedUIStateStore(
      {
        globalState: {
          get: vi.fn((key: string) => ({
            [repoLayoutKey('/repo-a')]: layoutA,
            [repoLayoutKey('/repo-b')]: layoutB,
          })[key]),
          update: vi.fn(),
        },
      } as never,
      () => currentRepoPath,
    );

    expect(repoAwareStore.loadPersistedUIState().commitTableLayout.columns.message.preferredWidth).toBe(500);

    currentRepoPath = '/repo-b';
    repoAwareStore.reloadRepoLayout();

    expect(repoAwareStore.loadPersistedUIState().commitTableLayout.columns.message.preferredWidth).toBe(300);
    expect(store).toBeDefined();
  });

  it('heals impossible persisted column widths', () => {
    const layout = createDefaultCommitTableLayout();
    layout.columns.message.preferredWidth = 100_000;
    const { store } = createStore({ [repoLayoutKey('/repo-a')]: layout });
    const sumOfMinWidths = Object.values(COMMIT_TABLE_MIN_WIDTHS).reduce((sum, width) => sum + width, 0);

    const state = store.loadPersistedUIState();

    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(
      HEALING_ASSUMED_CONTAINER_WIDTH - (sumOfMinWidths - COMMIT_TABLE_MIN_WIDTHS.message),
    );
  });
});

describe('PersistedUIStateStore alwaysShowBadgedCommits', () => {
  it('defaults to false when the field is missing from state saved before it existed', () => {
    const { alwaysShowBadgedCommits: _omitted, ...legacy } = DEFAULT_PERSISTED_UI_STATE;
    void _omitted;
    const { store } = createStore({
      'speedyGit.uiState': { ...legacy, detailsPanelPosition: 'right', bottomPanelHeight: 333 },
    });

    const state = store.loadPersistedUIState();

    expect(state.alwaysShowBadgedCommits).toBe(false);
    expect(state.detailsPanelPosition).toBe('right');
    expect(state.bottomPanelHeight).toBe(333);
  });

  it('falls back to false for a non-boolean value', () => {
    const { store } = createStore({
      'speedyGit.uiState': { ...DEFAULT_PERSISTED_UI_STATE, alwaysShowBadgedCommits: 'yes' },
    });

    expect(store.loadPersistedUIState().alwaysShowBadgedCommits).toBe(false);
  });

  it('round-trips true', () => {
    const globalState: Record<string, unknown> = {};
    createStore(globalState).store.savePersistedUIState({ alwaysShowBadgedCommits: true });

    expect(createStore(globalState).store.loadPersistedUIState().alwaysShowBadgedCommits).toBe(true);
  });

  it('ignores a non-boolean save and leaves other fields untouched', () => {
    const { store, extensionContext } = createStore({
      'speedyGit.uiState': { ...DEFAULT_PERSISTED_UI_STATE, detailsPanelPosition: 'right' },
    });

    store.savePersistedUIState({ alwaysShowBadgedCommits: 'yes' as never });
    expect(extensionContext.globalState.update).not.toHaveBeenCalled();

    store.savePersistedUIState({ alwaysShowBadgedCommits: true });
    const state = store.loadPersistedUIState();
    expect(state.alwaysShowBadgedCommits).toBe(true);
    expect(state.detailsPanelPosition).toBe('right');
  });
});

describe('PersistedUIStateStore badgedCommitOpacity', () => {
  it('defaults to 40 when missing or not one of the allowed values', () => {
    const { badgedCommitOpacity: _omitted, ...legacy } = DEFAULT_PERSISTED_UI_STATE;
    void _omitted;
    expect(createStore({ 'speedyGit.uiState': legacy }).store.loadPersistedUIState().badgedCommitOpacity).toBe(40);
    expect(
      createStore({ 'speedyGit.uiState': { ...DEFAULT_PERSISTED_UI_STATE, badgedCommitOpacity: 50 } })
        .store.loadPersistedUIState().badgedCommitOpacity,
    ).toBe(40);
  });

  it('round-trips 60 and ignores a value outside the allowed set', () => {
    const globalState: Record<string, unknown> = {};
    const { store } = createStore(globalState);
    store.savePersistedUIState({ badgedCommitOpacity: 60 });
    store.savePersistedUIState({ badgedCommitOpacity: 50 as never });

    expect(createStore(globalState).store.loadPersistedUIState().badgedCommitOpacity).toBe(60);
  });
});

describe('PersistedUIStateStore across multiple graph tabs', () => {
  /** Two stores over one shared memento — the same shape as two tabs in one window. */
  function createTwoTabs() {
    const memento: Record<string, unknown> = {};
    const extensionContext = {
      globalState: {
        get: vi.fn((key: string) => memento[key]),
        update: vi.fn((key: string, value: unknown) => {
          memento[key] = value;
          return Promise.resolve();
        }),
      },
    } as never;
    const repoPaths = { a: '/repo-a', b: '/repo-a' };
    return {
      memento,
      tabA: new PersistedUIStateStore(extensionContext, () => repoPaths.a),
      tabB: new PersistedUIStateStore(extensionContext, () => repoPaths.b),
      repoPaths,
    };
  }

  it('does not push one tab\'s save into another tab that is already open', () => {
    const { tabA, tabB } = createTwoTabs();
    tabB.loadPersistedUIState(); // B reads its seed before A saves.

    tabA.savePersistedUIState({ detailsPanelPosition: 'right' });

    expect(tabB.loadPersistedUIState().detailsPanelPosition).toBe(
      DEFAULT_PERSISTED_UI_STATE.detailsPanelPosition,
    );
  });

  it('last write wins in storage, and seeds the next tab opened', () => {
    const { tabA, tabB, memento } = createTwoTabs();

    tabA.savePersistedUIState({ detailsPanelPosition: 'right' });
    tabB.savePersistedUIState({ detailsPanelPosition: 'bottom' });

    expect((memento['speedyGit.uiState'] as { detailsPanelPosition: string }).detailsPanelPosition)
      .toBe('bottom');
  });

  it('neither tab\'s cache is corrupted by the other\'s write', () => {
    const { tabA, tabB } = createTwoTabs();

    tabA.savePersistedUIState({ detailsPanelPosition: 'right' });
    tabB.savePersistedUIState({ fileViewMode: 'tree' });

    expect(tabA.loadPersistedUIState().detailsPanelPosition).toBe('right');
    expect(tabA.loadPersistedUIState().fileViewMode).toBe(DEFAULT_PERSISTED_UI_STATE.fileViewMode);
    expect(tabB.loadPersistedUIState().fileViewMode).toBe('tree');
  });

  it('a repo switch re-reads only the table layout, never a peer\'s panel layout', () => {
    const layoutB = createDefaultCommitTableLayout();
    layoutB.columns.message.preferredWidth = 321;
    const memento: Record<string, unknown> = { [repoLayoutKey('/repo-b')]: layoutB };
    const extensionContext = {
      globalState: {
        get: vi.fn((key: string) => memento[key]),
        update: vi.fn((key: string, value: unknown) => {
          memento[key] = value;
          return Promise.resolve();
        }),
      },
    } as never;

    let repoPath = '/repo-a';
    const tab = new PersistedUIStateStore(extensionContext, () => repoPath);
    tab.savePersistedUIState({ detailsPanelPosition: 'right' });

    // A peer writes a different panel position while this tab sits on repo-a.
    memento['speedyGit.uiState'] = {
      ...(memento['speedyGit.uiState'] as object),
      detailsPanelPosition: 'bottom',
    };

    repoPath = '/repo-b';
    tab.reloadRepoLayout();

    const state = tab.loadPersistedUIState();
    expect(state.commitTableLayout.columns.message.preferredWidth).toBe(321);
    // The seeded global value survives the switch — importing the peer's is the
    // one thing the seed-on-open rule forbids.
    expect(state.detailsPanelPosition).toBe('right');
  });
});
