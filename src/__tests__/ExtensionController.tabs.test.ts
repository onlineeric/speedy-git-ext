import type { LogOutputChannel } from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTelemetryStub } from './telemetryTestStub.js';
import * as vscodeStub from 'vscode';
import { ExtensionController } from '../ExtensionController.js';

/**
 * Task 6's routing, with `GraphTab` replaced by a recording stub. The decisions
 * under test are "reveal or create, and on which repo" — none of which needs a
 * real webview panel.
 */
const tabState = vi.hoisted(() => ({
  created: [] as Array<{
    id: string;
    initialRepoPath: string;
    viewColumn: number;
    reveal: ReturnType<typeof vi.fn>;
    setTopLevelRepo: ReturnType<typeof vi.fn>;
    setDisplayedRepo: ReturnType<typeof vi.fn>;
    sendRepoList: ReturnType<typeof vi.fn>;
    open: ReturnType<typeof vi.fn>;
    topLevelRepoPath: string;
    displayedRepoPath: string;
    viewColumnGetter: number | undefined;
  }>,
  whatsNewOffers: 0,
  repos: [] as Array<{ path: string; name: string; displayName: string }>,
  activeRepoPath: '',
  repoListListener: undefined as (() => void) | undefined,
}));

vi.mock('../webview/GraphTab.js', () => ({
  GraphTab: class {
    readonly id: string;
    readonly initialRepoPath: string;
    topLevelRepoPath: string;
    displayedRepoPath: string;
    reveal = vi.fn();
    open = vi.fn(async () => {
      // A real tab offers release notes here; record whether it qualified.
      if (!this.options.shared.whatsNewOfferedThisSession) {
        this.options.shared.whatsNewOfferedThisSession = true;
        tabState.whatsNewOffers += 1;
      }
    });
    setWatcherSubscription = vi.fn();
    setTopLevelRepo = vi.fn(async (repoPath: string) => {
      this.topLevelRepoPath = repoPath;
      this.displayedRepoPath = repoPath;
      return 1;
    });
    setDisplayedRepo = vi.fn(async () => 1);
    sendRepoList = vi.fn();
    sendSettingsData = vi.fn();
    sendPeerActivity = vi.fn();
    postMessage = vi.fn();
    reload = vi.fn().mockResolvedValue(undefined);
    triggerAutoRefresh = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(private readonly options: any) {
      this.id = options.id;
      this.initialRepoPath = options.initialRepoPath;
      this.topLevelRepoPath = options.initialRepoPath;
      this.displayedRepoPath = options.initialRepoPath;
      tabState.created.push(this as never);
    }
    get viewColumn() { return this.options.viewColumn; }
    snapshot(lastActiveSeq: number) {
      return {
        id: this.id,
        topLevelRepoPath: this.topLevelRepoPath,
        displayedRepoPath: this.displayedRepoPath,
        identity: null,
        lastActiveSeq,
      };
    }
  },
}));

vi.mock('../ExtensionServices.js', () => ({
  ExtensionServices: class {
    whatsNewOfferedThisSession = false;
    repoDiscovery = {
      initialize: vi.fn().mockResolvedValue(undefined),
      onDidChangeRepos: vi.fn((listener: () => void) => {
        tabState.repoListListener = listener;
        return { dispose: vi.fn() };
      }),
      getRepos: () => tabState.repos,
      getActiveRepoPath: () => tabState.activeRepoPath,
      setActiveRepo: vi.fn((repoPath: string) => { tabState.activeRepoPath = repoPath; }),
      dispose: vi.fn(),
    };
    watcherHub = {
      onDidDetectChange: vi.fn(() => ({ dispose: vi.fn() })),
      watch: vi.fn().mockResolvedValue({ dispose: vi.fn() }),
    };
    activity = { onDidChange: vi.fn(() => ({ dispose: vi.fn() })) };
    connectTabs = vi.fn();
    resolveDiffService = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('vscode', () => ({
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2, Active: -1 },
  window: {
    createStatusBarItem: vi.fn(() => ({
      text: '', tooltip: '', command: '', show: vi.fn(), hide: vi.fn(), dispose: vi.fn(),
    })),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/repos/fallback' } }],
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback?: unknown) => fallback) })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  },
  Uri: { joinPath: vi.fn(), from: vi.fn(), parse: vi.fn(), file: vi.fn() },
}));

function createController() {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;
  const context = {
    subscriptions: [] as Array<{ dispose: () => void }>,
    globalState: { get: vi.fn(), update: vi.fn().mockResolvedValue(undefined) },
    extensionUri: {},
  } as never;
  const telemetry = createTelemetryStub();
  return { controller: new ExtensionController(context, log, telemetry, 0), telemetry, context };
}

beforeEach(() => {
  tabState.created.length = 0;
  tabState.whatsNewOffers = 0;
  tabState.repos = [
    { path: '/repos/a', name: 'a', displayName: 'a' },
    { path: '/repos/b', name: 'b', displayName: 'b' },
  ];
  tabState.activeRepoPath = '/repos/a';
  tabState.repoListListener = undefined;
  vi.mocked(vscodeStub.window.showInformationMessage).mockClear();
});

describe('showGraph', () => {
  it('creates the first graph on the saved default repo', async () => {
    const { controller } = createController();

    await controller.showGraph();

    expect(tabState.created).toHaveLength(1);
    expect(tabState.created[0].initialRepoPath).toBe('/repos/a');
  });

  it('reveals the most recently active graph instead of creating another', async () => {
    const { controller } = createController();
    await controller.showGraph();
    await controller.showGraph();

    expect(tabState.created).toHaveLength(1);
    expect(tabState.created[0].reveal).toHaveBeenCalledOnce();
  });

  it('falls back to the first workspace folder when nothing has been chosen', async () => {
    tabState.activeRepoPath = '';
    const { controller } = createController();

    await controller.showGraph();

    expect(tabState.created[0].initialRepoPath).toBe('/repos/fallback');
  });
});

describe('openForRepo', () => {
  it('reveals a graph whose TOP-LEVEL repo matches, even while it displays a submodule', async () => {
    const { controller } = createController();
    await controller.showGraph();
    tabState.created[0].displayedRepoPath = '/repos/a/sub';

    await controller.openForRepo({ rootUri: { fsPath: '/repos/a' } } as never);

    expect(tabState.created).toHaveLength(1);
    expect(tabState.created[0].reveal).toHaveBeenCalledOnce();
  });

  it('never retargets an existing graph', async () => {
    const { controller } = createController();
    await controller.showGraph();

    await controller.openForRepo({ rootUri: { fsPath: '/repos/a' } } as never);

    expect(tabState.created[0].setTopLevelRepo).not.toHaveBeenCalled();
    expect(tabState.created[0].setDisplayedRepo).not.toHaveBeenCalled();
  });

  it('creates a graph when no open one shows that repository', async () => {
    const { controller } = createController();
    await controller.showGraph();

    await controller.openForRepo({ rootUri: { fsPath: '/repos/b' } } as never);

    expect(tabState.created).toHaveLength(2);
    expect(tabState.created[1].initialRepoPath).toBe('/repos/b');
  });

  it('creates on the SCM-supplied path even when discovery does not list it', async () => {
    const { controller } = createController();

    await controller.openForRepo({ rootUri: { fsPath: '/repos/unlisted' } } as never);

    expect(tabState.created[0].initialRepoPath).toBe('/repos/unlisted');
  });

  it('does nothing for a source control with no root', async () => {
    const { controller } = createController();

    await controller.openForRepo({ rootUri: undefined } as never);

    expect(tabState.created).toHaveLength(0);
  });
});

describe('openNewGraphTab', () => {
  it('seeds from the origin\'s TOP-LEVEL repo, not the submodule it is displaying', async () => {
    const { controller } = createController();
    await controller.showGraph();
    tabState.created[0].displayedRepoPath = '/repos/a/sub';

    await controller.openNewGraphTab('toolbarButton');

    expect(tabState.created).toHaveLength(2);
    expect(tabState.created[1].initialRepoPath).toBe('/repos/a');
  });

  it('opens in the origin\'s editor group', async () => {
    const { controller } = createController();
    await controller.showGraph();

    await controller.openNewGraphTab('toolbarButton');

    expect(tabState.created[1].viewColumn).toBe(tabState.created[0].viewColumn);
  });

  it('permits the same repository in several tabs', async () => {
    const { controller } = createController();
    await controller.showGraph();
    await controller.openNewGraphTab('commandPalette');
    await controller.openNewGraphTab('commandPalette');

    expect(tabState.created.map((tab) => tab.initialRepoPath)).toEqual(['/repos/a', '/repos/a', '/repos/a']);
  });

  it('falls back to the saved default when no graph is open', async () => {
    const { controller } = createController();

    await controller.openNewGraphTab('commandPalette');

    expect(tabState.created[0].initialRepoPath).toBe('/repos/a');
  });
});

describe("What's New", () => {
  it('is offered in the first graph of the session only', async () => {
    const { controller } = createController();
    await controller.showGraph();
    await controller.openNewGraphTab('toolbarButton');
    await controller.openNewGraphTab('toolbarButton');

    expect(tabState.whatsNewOffers).toBe(1);
  });
});

describe('panelOpened telemetry', () => {
  it('is sent on creation, with the bucketed count AFTER this tab registered', async () => {
    const { controller, telemetry } = createController();

    await controller.showGraph();
    await controller.openNewGraphTab('toolbarButton');

    expect(telemetry.sendPanelOpened).toHaveBeenNthCalledWith(1, 'command', '1');
    expect(telemetry.sendPanelOpened).toHaveBeenNthCalledWith(2, 'toolbarButton', '2');
  });

  it('is NOT sent when an existing graph is merely revealed', async () => {
    const { controller, telemetry } = createController();
    await controller.showGraph();
    vi.mocked(telemetry.sendPanelOpened).mockClear();

    await controller.showGraph();
    await controller.openForRepo({ rootUri: { fsPath: '/repos/a' } } as never);

    expect(telemetry.sendPanelOpened).not.toHaveBeenCalled();
  });

  it('records the status bar as its own trigger rather than masquerading as a command', async () => {
    const { controller, telemetry } = createController();

    await controller.showGraph('statusBar');

    expect(telemetry.sendPanelOpened).toHaveBeenCalledWith('statusBar', '1');
  });
});

describe('a repository leaving the workspace', () => {
  /** Discovery resolves asynchronously, so the listener is registered a microtask later. */
  async function withRepoListListener(controller: InstanceType<typeof ExtensionController>) {
    await controller.showGraph();
    await Promise.resolve();
    await Promise.resolve();
    return tabState.repoListListener;
  }

  it('retargets only the tabs that were displaying it', async () => {
    const { controller } = createController();
    const fire = await withRepoListListener(controller);
    await controller.openNewGraphTab('toolbarButton');
    tabState.created[1].topLevelRepoPath = '/repos/b';
    tabState.created[1].displayedRepoPath = '/repos/b';

    tabState.repos = [{ path: '/repos/b', name: 'b', displayName: 'b' }];
    fire?.();
    await Promise.resolve();

    expect(tabState.created[0].setTopLevelRepo).toHaveBeenCalledWith('/repos/b', { userInitiated: false });
    expect(tabState.created[1].setTopLevelRepo).not.toHaveBeenCalled();
  });

  it('catches a tab sitting inside a submodule of the removed repo', async () => {
    const { controller } = createController();
    const fire = await withRepoListListener(controller);
    tabState.created[0].displayedRepoPath = '/repos/a/sub';

    tabState.repos = [{ path: '/repos/b', name: 'b', displayName: 'b' }];
    fire?.();
    await Promise.resolve();

    expect(tabState.created[0].setTopLevelRepo).toHaveBeenCalledWith('/repos/b', { userInitiated: false });
  });

  it('notifies once per removal, not once per affected tab', async () => {
    const { controller } = createController();
    const fire = await withRepoListListener(controller);
    await controller.openNewGraphTab('toolbarButton');

    tabState.repos = [{ path: '/repos/b', name: 'b', displayName: 'b' }];
    fire?.();
    await Promise.resolve();

    expect(vscodeStub.window.showInformationMessage).toHaveBeenCalledOnce();
  });

  it('leaves every tab where it is when no repository remains', async () => {
    const { controller } = createController();
    const fire = await withRepoListListener(controller);

    tabState.repos = [];
    fire?.();
    await Promise.resolve();

    expect(tabState.created[0].setTopLevelRepo).not.toHaveBeenCalled();
    // The selector still empties — the repo list is re-sent.
    expect(tabState.created[0].sendRepoList).toHaveBeenCalled();
  });

  it('re-sends the repo list to unaffected tabs and nothing else', async () => {
    const { controller } = createController();
    const fire = await withRepoListListener(controller);
    tabState.created[0].sendRepoList.mockClear();

    fire?.();
    await Promise.resolve();

    expect(tabState.created[0].sendRepoList).toHaveBeenCalledOnce();
    expect(tabState.created[0].setTopLevelRepo).not.toHaveBeenCalled();
  });
});
