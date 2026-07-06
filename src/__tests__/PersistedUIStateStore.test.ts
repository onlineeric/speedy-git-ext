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
    repoAwareStore.invalidateCache();

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
