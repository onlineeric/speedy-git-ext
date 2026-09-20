import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { ExtensionServices } from './ExtensionServices.js';
import { GraphTabRegistry } from './GraphTabRegistry.js';
import { GraphTab } from './webview/GraphTab.js';
import type { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import type { SettingsSnapshotProperties, TelemetryService } from './services/TelemetryService.js';
import { PersistedUIStateStore } from './webview/PersistedUIStateStore.js';
import { GitError } from '../shared/errors.js';
import { PANEL_OPENED_TRIGGERS, toTabCountBucket, type PanelOpenedTrigger } from '../shared/telemetry.js';
import {
  peersSharingWorkingTree,
  pickRepoTarget,
  pickReturnTarget,
  tabsAffectedByChange,
} from './utils/graphTabRouting.js';
import {
  pickSplitFillGroup,
  type EditorGroupSnapshot,
} from './utils/editorSplitFill.js';
import { isPathInside, pathsEqual } from './utils/repoIdentity.js';
import {
  clampAvatarRefreshDays,
  clampBatchCommitSize,
  DEFAULT_GRAPH_COLORS,
  DEFAULT_USER_SETTINGS,
  normalizeWorktreeFolderNameStyle,
  type UserDateFormat,
  type UserSettings,
} from '../shared/types.js';

/**
 * Owns the window-level surfaces — repo discovery, the status bar, settings,
 * session telemetry — and the collection of graph tabs.
 *
 * Nothing view-scoped lives here any more. A tab owns its repository, its
 * services and its investigation; this class only decides *which* tab an entry
 * point should reveal or create, and routes repository changes to the tabs they
 * affect.
 */
export class ExtensionController {
  private readonly shared: ExtensionServices;
  private readonly registry = new GraphTabRegistry();
  private statusBarItem: vscode.StatusBarItem | undefined;
  /**
   * The editor group the user was working in, as of the last change we saw.
   * Remembered because a split has already moved the focus to the new group by
   * the time its event arrives.
   */
  private lastActiveGroup: EditorGroupSnapshot | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
    private readonly telemetry: TelemetryService,
    private readonly activationStart: number,
  ) {
    this.shared = new ExtensionServices(context, log, telemetry);
    this.shared.connectTabs({
      broadcast: (message) => this.registry.broadcast(message),
      reloadAll: () => this.registry.reloadAll(),
    });

    this.context.subscriptions.push(
      this.shared.watcherHub.onDidDetectChange((changed) => {
        for (const snapshot of tabsAffectedByChange(this.registry.snapshots(), changed)) {
          this.registry.get(snapshot.id)?.triggerAutoRefresh().catch((err: unknown) => {
            this.log.error(`Auto-refresh failed: ${err}`);
            // Untracked-path failure (FR-014): area + standardized code only.
            this.telemetry.sendError('watcher', err instanceof GitError ? err.code : 'UNKNOWN');
          });
        }
      }),
      // A peer's running operation is mirrored as a notice. Never a lock: the
      // tab that owns the operation keeps its own busy state, and everyone else
      // keeps every control enabled.
      this.shared.activity.onDidChange(() => {
        for (const tab of this.registry.all()) tab.sendPeerActivity();
      }),
    );

    this.initRepoDiscovery();
    this.registerSettingsListener();
    this.registerSplitEditorFill();
  }

  private initRepoDiscovery() {
    const discovery = this.shared.repoDiscovery;

    discovery.initialize().then(() => {
      this.updateStatusBar();
      this.sendActivationTelemetry(discovery);

      this.context.subscriptions.push(
        discovery.onDidChangeRepos(() => {
          this.updateStatusBar();
          this.handleRepoListChanged();
        }),
      );
    }).catch((err) => {
      this.log.error(`GitRepoDiscoveryService initialization failed: ${err}`);
      // Untracked-path failure (FR-014): functional area + standardized code only.
      this.telemetry.sendError('repoDiscovery', err instanceof GitError ? err.code : 'UNKNOWN');
    });

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    statusBar.text = this.readStatusBarText();
    statusBar.tooltip = 'Open Speedy Git';
    // Same command as the palette and the keybinding — it means "return to the
    // most recently active graph, or open the first one" — but carrying its own
    // trigger, so the status bar stops masquerading as a Command Palette use.
    statusBar.command = {
      command: 'speedyGit.showGraph',
      title: 'Open Speedy Git',
      arguments: ['statusBar'] satisfies [PanelOpenedTrigger],
    };
    this.statusBarItem = statusBar;
    this.context.subscriptions.push(statusBar);

    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateStatusBar();
      }),
    );
  }

  /**
   * Session-level telemetry (US3/US5): one `activate` + one `settingsSnapshot`
   * per session, sent fire-and-forget after repo discovery resolves so the
   * activation path never waits on it. One-shot behavior is guaranteed by the
   * TelemetryService itself.
   */
  private sendActivationTelemetry(discovery: GitRepoDiscoveryService) {
    const hasMultiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    this.telemetry.sendActivate(
      {
        activationMs: performance.now() - this.activationStart,
        repoCount: discovery.getRepos().length,
      },
      hasMultiRoot,
    );

    const settings = this.readUserSettings();
    const snapshot: SettingsSnapshotProperties = {
      dateFormat: settings.dateFormat,
      avatarsEnabled: settings.avatarsEnabled ? 'true' : 'false',
      showTags: settings.showTags ? 'true' : 'false',
      showRemoteBranches: settings.showRemoteBranches ? 'true' : 'false',
      toolbarShowLabels: settings.toolbarShowLabels ? 'true' : 'false',
      toolbarShowRemoteButton: settings.toolbarShowRemoteButton ? 'true' : 'false',
      statusBarText: this.readStatusBarText() === '$(zap)' ? 'icon' : 'iconAndText',
    };
    const signatureColumnVisible = this.readSignatureColumnVisible();
    if (signatureColumnVisible !== undefined) {
      snapshot.signatureColumnVisible = signatureColumnVisible;
    }
    this.telemetry.sendSettingsSnapshot(snapshot, {
      batchCommitSize: settings.batchCommitSize,
      overScan: settings.overScan,
      avatarRefreshDays: settings.avatarRefreshDays,
    });
  }

  /**
   * Persisted-UI-state read for the snapshot; omitted when unavailable.
   * Pointed explicitly at the saved default repo rather than at whatever a tab
   * happens to display, since no tab need exist when this runs.
   */
  private readSignatureColumnVisible(): 'true' | 'false' | undefined {
    try {
      const store = new PersistedUIStateStore(this.context, () => this.savedDefaultRepo() ?? '');
      return store.loadPersistedUIState().commitTableLayout.columns.signature.visible ? 'true' : 'false';
    } catch {
      return undefined;
    }
  }

  private updateStatusBar() {
    if (!this.statusBarItem) return;
    if (this.shared.repoDiscovery.getRepos().length === 0) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.show();
  }

  private registerSettingsListener() {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('speedyGit.statusBarText') && this.statusBarItem) {
          this.statusBarItem.text = this.readStatusBarText();
        }

        if (this.didSpeedyGitWebviewSettingsChange(event)) {
          // `speedyGit.*` settings are extension-wide and apply to every tab.
          const settings = this.readUserSettings();
          for (const tab of this.registry.all()) tab.sendSettingsData(settings);
        }
      }),
    );
  }

  /**
   * Make "Split Editor Right" on a graph mean "open another graph beside this
   * one", which is what splitting any other editor does.
   *
   * A webview cannot be duplicated, so VS Code answers the split with an empty
   * editor group and there is no command to intercept — the split is instead
   * recognised from that empty group (see `utils/editorSplitFill.ts`). One
   * listener therefore covers the editor title button, `Ctrl+\`, split down and
   * split left alike.
   *
   * Both events keep {@link lastActiveGroup} current: a group change fires when
   * the focused GROUP changes, a tab change when the active tab within one does.
   */
  private registerSplitEditorFill() {
    const tabGroups = vscode.window.tabGroups;
    this.lastActiveGroup = snapshotGroup(tabGroups.activeTabGroup);

    this.context.subscriptions.push(
      tabGroups.onDidChangeTabGroups((event) => {
        const source = this.lastActiveGroup;
        this.lastActiveGroup = snapshotGroup(tabGroups.activeTabGroup);

        const opened = event.opened.map((group) => ({ group, ...snapshotGroup(group) }));
        const target = pickSplitFillGroup(opened, source);
        if (target) void this.fillSplitGroup(target.group);
      }),
      tabGroups.onDidChangeTabs(() => {
        this.lastActiveGroup = snapshotGroup(tabGroups.activeTabGroup);
      }),
    );
  }

  /**
   * Fill a group a graph's split just emptied, seeded like any other new tab:
   * the origin graph's TOP-LEVEL repo, normal defaults, nothing else copied.
   *
   * The group is re-read a tick later because a tab DRAGGED into a brand-new
   * group also opens that group empty, and arrives in it immediately after —
   * that group must keep the dragged tab rather than gain a graph. Nothing is
   * reported when there is no repository: this was never an explicit request,
   * so it must not raise an error message.
   */
  private async fillSplitGroup(group: vscode.TabGroup): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (group.tabs.length > 0) return;

    const origin = pickReturnTarget(this.registry.snapshots());
    const repoPath = origin ? origin.topLevelRepoPath : this.savedDefaultRepo();
    if (!repoPath) return;

    await this.createTab(repoPath, group.viewColumn, 'splitEditor');
  }

  /**
   * Ordinary Open: return to the most recently active graph, creating one only
   * when none is open.
   *
   * A reveal is *only* a reveal — no reload, no retarget, and no `panelOpened`
   * telemetry, which is counted on creation alone.
   */
  async showGraph(trigger: unknown = 'command'): Promise<void> {
    // The command is invocable by anyone, so its argument is never trusted to
    // be a catalog value.
    const openedBy: PanelOpenedTrigger = PANEL_OPENED_TRIGGERS.includes(trigger as PanelOpenedTrigger)
      ? (trigger as PanelOpenedTrigger)
      : 'command';

    const target = pickReturnTarget(this.registry.snapshots());
    if (target) {
      this.registry.get(target.id)?.reveal();
      return;
    }

    const repoPath = this.savedDefaultRepo();
    if (!repoPath) {
      vscode.window.showErrorMessage('Speedy Git: No workspace folder open');
      return;
    }
    await this.createTab(repoPath, vscode.ViewColumn.Active, openedBy);
  }

  /**
   * SCM title button. It names a specific repository, so it is repository-aware
   * rather than a plain return: reveal a graph already showing that repo, else
   * create one. It never retargets an existing graph.
   */
  async openForRepo(sourceControl: vscode.SourceControl): Promise<void> {
    const repoPath = sourceControl.rootUri?.fsPath;
    if (!repoPath) return;

    // Naming a repository IS an explicit switch, so it moves the saved default —
    // which seeds the next first-opened graph and nothing else.
    this.shared.repoDiscovery.setActiveRepo(repoPath);

    const target = pickRepoTarget(this.registry.snapshots(), repoPath);
    if (target) {
      this.registry.get(target.id)?.reveal();
      return;
    }

    // Discovery may not list a repo the SCM provider knows about yet; the SCM
    // provider is authoritative about its own root, and the services are
    // path-bound, so create on the supplied path regardless.
    await this.createTab(repoPath, vscode.ViewColumn.Active, 'scmButton');
  }

  /**
   * Open another graph, seeded from the originating graph's TOP-LEVEL repo —
   * not a submodule it has navigated into — in the same editor group.
   *
   * No picker, no confirmation, duplicates of one repo permitted. The new tab
   * starts from normal defaults; it deliberately copies none of the origin's
   * filters, search, selection or scroll.
   */
  async openNewGraphTab(trigger: 'toolbarButton' | 'commandPalette'): Promise<void> {
    const origin = pickReturnTarget(this.registry.snapshots());
    const repoPath = origin ? origin.topLevelRepoPath : this.savedDefaultRepo();
    if (!repoPath) {
      vscode.window.showErrorMessage('Speedy Git: No workspace folder open');
      return;
    }

    // A hidden origin reports no view column; land in the active group instead.
    const viewColumn = (origin && this.registry.get(origin.id)?.viewColumn) ?? vscode.ViewColumn.Active;
    await this.createTab(repoPath, viewColumn, trigger);
  }

  /** The one creation path. Every entry point funnels through it. */
  private async createTab(
    repoPath: string,
    viewColumn: vscode.ViewColumn,
    trigger: PanelOpenedTrigger,
  ): Promise<GraphTab> {
    const id = randomUUID();
    const tab = new GraphTab({
      id,
      shared: this.shared,
      initialRepoPath: repoPath,
      viewColumn,
      getSettings: () => this.readUserSettings(),
      onDisposed: (disposedId) => {
        this.registry.get(disposedId)?.dispose();
        this.registry.remove(disposedId);
      },
      onActivated: (activatedId) => this.registry.markActivated(activatedId),
      openNewGraphTab: () => {
        void this.openNewGraphTab('toolbarButton');
      },
      onDisplayedRepoChanged: (changed) => {
        void this.subscribeWatcher(changed);
      },
      setSavedDefaultRepo: (path) => this.shared.repoDiscovery.setActiveRepo(path),
    });

    this.registry.add(tab);
    this.log.info(`Showing git graph (${this.registry.count()} open)`);
    await tab.open();
    await this.subscribeWatcher(tab);

    // The bucket is the count AFTER this tab registered, so the first graph of
    // a session reports '1'. A reveal is never a `panelOpened`.
    this.telemetry.sendPanelOpened(trigger, toTabCountBucket(this.registry.count()));
    return tab;
  }

  private async subscribeWatcher(tab: GraphTab): Promise<void> {
    tab.setWatcherSubscription(await this.shared.watcherHub.watch(tab.displayedRepoPath));
  }

  /**
   * A repository joined or left the workspace.
   *
   * Only tabs actually displaying the removed repo move, and the notification
   * fires once per removal rather than once per affected tab. With no repos
   * left there is nothing to retarget to, so every tab stays where it is and
   * only the selector empties — the git data is still on disk.
   */
  private handleRepoListChanged(): void {
    const repos = this.shared.repoDiscovery.getRepos();
    const known = new Set(repos.map((repo) => repo.path));

    const orphaned = this.registry.all().filter(
      (tab) =>
        !known.has(tab.topLevelRepoPath)
        && ![...known].some(
          (repoPath) => pathsEqual(repoPath, tab.topLevelRepoPath) || isPathInside(repoPath, tab.displayedRepoPath),
        ),
    );

    if (orphaned.length === 0 || repos.length === 0) {
      for (const tab of this.registry.all()) tab.sendRepoList();
      return;
    }

    const fallback = repos[0];
    for (const tab of orphaned) {
      // Not user-initiated: a repo disappearing must not move the saved default.
      void tab.setTopLevelRepo(fallback.path, { userInitiated: false }).then(() => {
        tab.sendRepoList();
        return tab.reload();
      });
    }
    for (const tab of this.registry.all()) {
      if (!orphaned.includes(tab)) tab.sendRepoList();
    }

    const suffix = orphaned.length > 1 ? ` (${orphaned.length} graphs)` : '';
    vscode.window.showInformationMessage(
      `Speedy Git: The displayed repository was removed. Switched to "${fallback.displayName}".${suffix}`,
    );
  }

  /**
   * The repository a *first* graph opens on: the one most recently chosen by an
   * explicit switch, else the first workspace folder. Updating it never changes
   * an open graph.
   */
  private savedDefaultRepo(): string | undefined {
    const active = this.shared.repoDiscovery.getActiveRepoPath();
    if (active) return active;
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * The diff service for a repository, from the extension-wide map. Held here
   * rather than on a tab so a `git-show:` document outlives the graph that
   * opened it.
   */
  resolveDiffService(repoPath: string) {
    return this.shared.resolveDiffService(repoPath);
  }

  /** Test seam: which tabs would see a peer's operation on this one's working tree. */
  peerTabsOf(tabId: string): string[] {
    const snapshots = this.registry.snapshots();
    const origin = snapshots.find((snapshot) => snapshot.id === tabId);
    if (!origin) return [];
    return peersSharingWorkingTree(snapshots, origin).map((snapshot) => snapshot.id);
  }

  dispose() {
    this.registry.dispose();
    this.shared.dispose();
    this.statusBarItem?.dispose();
    this.statusBarItem = undefined;
  }

  private didSpeedyGitWebviewSettingsChange(event: vscode.ConfigurationChangeEvent): boolean {
    return [
      'speedyGit.graphColors',
      'speedyGit.dateFormat',
      'speedyGit.dateFormatCustom',
      'speedyGit.avatars.enabled',
      'speedyGit.avatars.refreshDays',
      'speedyGit.showRemoteBranches',
      'speedyGit.showTags',
      'speedyGit.batchCommitSize',
      'speedyGit.overScan',
      'speedyGit.worktree.basePath',
      'speedyGit.worktree.folderNameStyle',
      'speedyGit.toolbar.showLabels',
      'speedyGit.toolbar.showRemoteButton',
    ].some((section) => event.affectsConfiguration(section));
  }

  private readStatusBarText(): string {
    const mode = vscode.workspace.getConfiguration('speedyGit').get<string>('statusBarText', 'iconAndText');
    return mode === 'icon' ? '$(zap)' : '$(zap) Speedy Git';
  }

  readUserSettings(): UserSettings {
    const config = vscode.workspace.getConfiguration('speedyGit');
    const graphColors = this.normalizeGraphColors(
      config.get<unknown>('graphColors', [...DEFAULT_USER_SETTINGS.graphColors])
    );
    const dateFormat = this.normalizeDateFormat(
      config.get<string>('dateFormat', DEFAULT_USER_SETTINGS.dateFormat)
    );
    const dateFormatCustom = config.get<string>('dateFormatCustom', DEFAULT_USER_SETTINGS.dateFormatCustom) ?? '';
    const batchCommitSize = clampBatchCommitSize(
      config.get<number>('batchCommitSize', DEFAULT_USER_SETTINGS.batchCommitSize)
    );
    const overScan = this.normalizeOverScan(
      config.get<number>('overScan', DEFAULT_USER_SETTINGS.overScan)
    );
    const worktreeBasePath = this.normalizeWorktreeBasePath(
      config.get<string>('worktree.basePath', DEFAULT_USER_SETTINGS.worktreeBasePath)
    );

    return {
      graphColors,
      dateFormat,
      dateFormatCustom,
      avatarsEnabled: config.get<boolean>('avatars.enabled', DEFAULT_USER_SETTINGS.avatarsEnabled),
      avatarRefreshDays: clampAvatarRefreshDays(
        config.get<number>('avatars.refreshDays', DEFAULT_USER_SETTINGS.avatarRefreshDays),
        DEFAULT_USER_SETTINGS.avatarRefreshDays,
      ),
      showRemoteBranches: config.get<boolean>('showRemoteBranches', DEFAULT_USER_SETTINGS.showRemoteBranches),
      showTags: config.get<boolean>('showTags', DEFAULT_USER_SETTINGS.showTags),
      batchCommitSize,
      overScan,
      worktreeBasePath,
      worktreeFolderNameStyle: normalizeWorktreeFolderNameStyle(
        config.get<string>('worktree.folderNameStyle', DEFAULT_USER_SETTINGS.worktreeFolderNameStyle)
      ),
      toolbarShowLabels: config.get<boolean>('toolbar.showLabels', DEFAULT_USER_SETTINGS.toolbarShowLabels),
      toolbarShowRemoteButton: config.get<boolean>('toolbar.showRemoteButton', DEFAULT_USER_SETTINGS.toolbarShowRemoteButton),
    };
  }

  private normalizeGraphColors(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [...DEFAULT_GRAPH_COLORS];
    }

    const colors = value.filter((item): item is string => typeof item === 'string' && isHexColor(item));
    return colors.length > 0 ? colors : [...DEFAULT_GRAPH_COLORS];
  }

  private normalizeDateFormat(value: string): UserDateFormat {
    switch (value) {
      case 'absolute':
      case 'absolute-date':
      case 'system':
      case 'custom':
      case 'relative':
        return value;
      default:
        return 'relative';
    }
  }

  private normalizeWorktreeBasePath(value: string): string {
    const trimmed = (value ?? '').trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_USER_SETTINGS.worktreeBasePath;
  }

  private normalizeOverScan(value: number): number {
    return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), 200) : DEFAULT_USER_SETTINGS.overScan;
  }
}

/** A tab group reduced to what the split rule asks about. */
function snapshotGroup(group: vscode.TabGroup): EditorGroupSnapshot {
  const activeInput = group.activeTab?.input;
  return {
    viewColumn: group.viewColumn,
    tabCount: group.tabs.length,
    activeWebviewViewType:
      activeInput instanceof vscode.TabInputWebview ? activeInput.viewType : null,
  };
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);
}
