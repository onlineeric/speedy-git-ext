import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../../shared/messages.js';
import type { UserSettings } from '../../shared/types.js';
import type { TrackedOperation } from '../../shared/telemetry.js';
import type { ExtensionServices } from '../ExtensionServices.js';
import { GitConfigService } from '../services/GitConfigService.js';
import { parseGitVersion, type GitVersion } from '../../shared/gitVersion.js';
import { clampBatchCommitSize, DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import { panelTitleFor, type TabSnapshot } from '../utils/graphTabRouting.js';
import { EditorCommandService } from './EditorCommandService.js';
import { createGitServices } from './createGitServices.js';
import { GitServiceRegistry, type GitServiceSet } from './GitServiceRegistry.js';
import { OperationGuard } from './OperationGuard.js';
import { PersistedUIStateStore } from './PersistedUIStateStore.js';
import { RefreshCoordinator } from './RefreshCoordinator.js';
import { RepoDataLoader } from './RepoDataLoader.js';
import { WebviewMessageRouter } from './WebviewMessageRouter.js';
import { WebviewPanelHost } from './WebviewPanelHost.js';
import type { WebviewRequestContext } from './WebviewRequestContext.js';
import { WebviewRuntime } from './WebviewRuntime.js';

export interface GraphTabOptions {
  /** Stable for the tab's lifetime; the key the activity registry and logs use. */
  readonly id: string;
  readonly shared: ExtensionServices;
  readonly initialRepoPath: string;
  readonly viewColumn: vscode.ViewColumn;
  readonly getSettings: () => UserSettings;
  readonly onDisposed: (id: string) => void;
  readonly onActivated: (id: string) => void;
  readonly openNewGraphTab: (origin: GraphTab) => void;
  /** Called after a repo change so the controller can re-subscribe the watcher. */
  readonly onDisplayedRepoChanged: (tab: GraphTab) => void;
  /** Explicit user repo switch — the one thing that moves the saved default. */
  readonly setSavedDefaultRepo: (repoPath: string) => void;
}

/**
 * One graph — one editor tab — and everything view-scoped that belongs to it.
 *
 * Every field here is per tab by design: the repository it displays, its
 * filters, its search, its selection, its layout and its scroll position. What
 * must exist once per window lives in {@link ExtensionServices} instead, and
 * this object reaches it through `shared`.
 */
export class GraphTab {
  private readonly runtime: WebviewRuntime;
  private readonly services: GitServiceRegistry;
  private readonly uiStateStore: PersistedUIStateStore;
  private readonly panelHost: WebviewPanelHost;
  private readonly dataLoader: RepoDataLoader;
  private readonly refreshCoordinator: RefreshCoordinator;
  private readonly editorCommands: EditorCommandService;
  private readonly operationGuard: OperationGuard;
  private readonly router: WebviewMessageRouter;
  private readonly shared: ExtensionServices;
  private readonly log: vscode.LogOutputChannel;
  /** Released and replaced on every repo change; disposed with the tab. */
  private watcherSubscription: vscode.Disposable | undefined;
  /** Set by {@link dispose}, so a subscription still in flight is released rather than stored. */
  private disposed = false;

  constructor(private readonly options: GraphTabOptions) {
    this.shared = options.shared;
    this.log = options.shared.log;

    this.runtime = new WebviewRuntime(options.initialRepoPath);
    this.services = new GitServiceRegistry(createGitServices(options.initialRepoPath, this.log));
    this.uiStateStore = new PersistedUIStateStore(
      options.shared.context,
      () => this.runtime.currentRepoPath,
    );
    this.panelHost = new WebviewPanelHost(options.shared.context, this.log);

    this.dataLoader = new RepoDataLoader({
      log: this.log,
      runtime: this.runtime,
      services: this.services,
      uiStateStore: this.uiStateStore,
      avatarCache: options.shared.avatarCache,
      avatarQueue: options.shared.avatarQueue,
      isAvatarAuthorized: () => options.shared.avatarAuth.isOptedIn(),
      postMessage: (message) => this.postMessage(message),
      getSettings: () => options.getSettings(),
      getBatchSize: () => this.getBatchSize(),
      getSubmoduleHandlers: () => ({
        getStack: () => [...this.runtime.submoduleStack],
        openSubmodule: () => {},
        backToParentRepo: () => this.backToParentRepo(),
      }),
      telemetry: options.shared.telemetry,
    });
    this.refreshCoordinator = new RefreshCoordinator(this.log, this.dataLoader);
    this.editorCommands = new EditorCommandService(
      this.log,
      options.shared.context.extensionUri,
      this.runtime,
      this.services,
    );
    this.operationGuard = new OperationGuard(this.services);
    this.router = new WebviewMessageRouter(this.log, this.createRequestContext());
  }

  get id(): string {
    return this.options.id;
  }

  get topLevelRepoPath(): string {
    return this.runtime.topLevelRepoPath;
  }

  get displayedRepoPath(): string {
    return this.runtime.currentRepoPath;
  }

  /** `undefined` while hidden — the caller falls back to `ViewColumn.Active`. */
  get viewColumn(): vscode.ViewColumn | undefined {
    return this.panelHost.viewColumn;
  }

  snapshot(lastActiveSeq: number): TabSnapshot {
    return {
      id: this.options.id,
      topLevelRepoPath: this.runtime.topLevelRepoPath,
      displayedRepoPath: this.runtime.currentRepoPath,
      identity: this.runtime.identity,
      lastActiveSeq,
    };
  }

  /** Create the editor panel and send the tab's first batch of data. */
  async open(): Promise<void> {
    this.panelHost.create({
      viewColumn: this.options.viewColumn,
      title: panelTitleFor(this.runtime.currentRepoPath),
      onMessage: (message) => {
        this.handleMessage(message).catch((error) => {
          this.log.error(`Error handling message: ${message.type} — ${error}`);
          this.postMessage({ type: 'error', payload: { error: { message: String(error) } } });
        });
      },
      onViewStateChanged: ({ visible, active }) => {
        this.refreshCoordinator.setPanelVisible(visible);
        if (active) this.options.onActivated(this.options.id);
      },
      onDisposed: () => {
        this.runtime.initialLoadSent = false;
        this.options.onDisposed(this.options.id);
      },
    });

    await this.resolveIdentity();
    this.sendWhatsNew();
    this.sendRepoList();
    this.sendSettingsData(this.options.getSettings());
    // Send the peer-busy state up front, so a tab created while a peer is
    // mid-operation shows the notice from its first paint rather than only
    // after the next change.
    this.sendPeerActivity();
    await this.refreshCoordinator.reload();
  }

  reveal(preserveFocus = false): void {
    this.panelHost.reveal(preserveFocus);
  }

  isPanelOpen(): boolean {
    return this.panelHost.isOpen();
  }

  async reload(): Promise<void> {
    await this.refreshCoordinator.reload();
  }

  async triggerAutoRefresh(): Promise<void> {
    await this.refreshCoordinator.triggerAutoRefresh();
  }

  /** The tab's own repo list, with ITS selection — never another tab's. */
  sendRepoList(): void {
    this.postMessage({
      type: 'repoList',
      payload: {
        repos: this.shared.repoDiscovery.getRepos(),
        activeRepoPath: this.runtime.topLevelRepoPath,
      },
    });
  }

  sendSettingsData(settings: UserSettings): void {
    this.postMessage({ type: 'settingsData', payload: { settings } });
  }

  postMessage(message: ResponseMessage): void {
    this.panelHost.postMessage(message);
  }

  /** Whether a peer tab on this working tree is running an operation right now. */
  sendPeerActivity(): void {
    const key = this.runtime.identity?.gitDir ?? '';
    const busy = key ? this.shared.activity.isBusy(key, this.options.id) : false;
    this.postMessage({ type: 'peerActivity', payload: { busy } });
  }

  /**
   * Show a different repository in this tab.
   *
   * Every step is per tab: new services, reset runtime state, a fresh table
   * layout for the new repo, a new watcher subscription and a new title. No
   * other tab is touched.
   *
   * Answers the navigation generation it began with, so a caller can tell
   * whether a later navigation overtook it before reloading.
   */
  async setDisplayedRepo(repoPath: string): Promise<number> {
    const generation = this.runtime.beginNavigation();
    this.services.update(createGitServices(repoPath, this.log));
    this.runtime.resetRepoScopedState(repoPath);
    this.uiStateStore.reloadRepoLayout();
    this.dataLoader.resetRepoScopedState();
    this.panelHost.setTitle(panelTitleFor(repoPath));
    await this.resolveIdentity();
    this.options.onDisplayedRepoChanged(this);
    return generation;
  }

  /**
   * Switch the tab's *selected* repository — the top-level one the selector
   * shows. Clears any submodule navigation, and (for an explicit user switch)
   * moves the saved default that seeds the next first-opened graph.
   */
  async setTopLevelRepo(repoPath: string, options: { userInitiated: boolean }): Promise<number> {
    this.runtime.submoduleStack = [];
    this.runtime.isDisplayingSubmodule = false;
    this.runtime.topLevelRepoPath = repoPath;
    if (options.userInitiated) this.options.setSavedDefaultRepo(repoPath);
    return this.setDisplayedRepo(repoPath);
  }

  /**
   * Disposes this tab's own objects only — never anything in
   * {@link ExtensionServices}, which other tabs are still using.
   *
   * It aborts nothing. An operation this tab started runs to completion; its
   * result simply has no webview to post to, which `postMessage` already
   * handles.
   */
  dispose(): void {
    this.disposed = true;
    this.watcherSubscription?.dispose();
    this.watcherSubscription = undefined;
    this.panelHost.dispose();
  }

  /** Re-resolve the identity for whatever the tab now displays. */
  private async resolveIdentity(): Promise<void> {
    const resolved = await this.shared.identities.resolve(this.runtime.currentRepoPath);
    this.runtime.identity = resolved.success ? resolved.value : null;
  }

  /**
   * Subscribing is async, so the tab can close while a `watch()` is in flight.
   * Storing the result then would strand a ref-counted watcher set for the rest
   * of the session, so a late arrival is released instead.
   */
  setWatcherSubscription(subscription: vscode.Disposable): void {
    if (this.disposed) {
      subscription.dispose();
      return;
    }
    this.watcherSubscription?.dispose();
    this.watcherSubscription = subscription;
  }

  async backToParentRepo(): Promise<void> {
    if (this.runtime.submoduleNavigating) return;
    this.runtime.submoduleNavigating = true;
    try {
      const parent = this.runtime.submoduleStack.pop();
      if (!parent) return;
      this.runtime.isDisplayingSubmodule = this.runtime.submoduleStack.length > 0;
      await this.setDisplayedRepo(parent.repoPath);
    } finally {
      this.runtime.submoduleNavigating = false;
    }
  }

  /**
   * Offer the "What's new" dialog when this run qualifies AND this is the first
   * graph of the session. Later graphs never offer it, even while the first
   * one's dialog is still open.
   */
  private sendWhatsNew(): void {
    if (this.shared.whatsNewOfferedThisSession) return;
    this.shared.whatsNewOfferedThisSession = true;

    const { show, countdownSeconds } = this.shared.whatsNew.decide();
    if (!show) return;

    this.postMessage({
      type: 'whatsNew',
      payload: { version: this.shared.whatsNew.currentVersion, countdownSeconds },
    });
  }

  private async handleMessage(message: RequestMessage): Promise<void> {
    await this.router.dispatch(message);
  }

  private createRequestContext(): WebviewRequestContext {
    return {
      log: this.log,
      extensionUri: this.shared.context.extensionUri,
      runtime: this.runtime,
      services: this.services,
      dataLoader: this.dataLoader,
      refreshCoordinator: this.refreshCoordinator,
      editorCommands: this.editorCommands,
      operationGuard: this.operationGuard,
      uiStateStore: this.uiStateStore,
      telemetry: this.shared.telemetry,
      avatarAuth: this.shared.avatarAuth,
      tabId: this.options.id,
      postMessage: (message) => this.postMessage(message),
      sendAvatarAuthState: () => this.postMessage(this.shared.buildAvatarAuthState()),
      clearAvatarCache: () => this.shared.clearAvatarCache(),
      getSettings: () => this.options.getSettings(),
      getBatchSize: () => this.getBatchSize(),
      getGitVersion: () => {
        this.runtime.gitVersion ??= this.readGitVersion();
        return this.runtime.gitVersion;
      },
      getRepoDiscovery: () => this.shared.repoDiscovery,
      getTopLevelRepoPath: () => this.runtime.topLevelRepoPath,
      getIdentity: () => this.runtime.identity,
      setDisplayedRepo: (repoPath) => this.setDisplayedRepo(repoPath),
      setTopLevelRepo: (repoPath) => this.setTopLevelRepo(repoPath, { userInitiated: true }),
      backToParentRepo: () => this.backToParentRepo(),
      pushSubmoduleEntry: (entry) => {
        this.runtime.submoduleStack.push(entry);
      },
      openNewGraphTab: () => this.options.openNewGraphTab(this),
      beginRepoActivity: (operation: TrackedOperation) =>
        this.shared.activity.begin(this.runtime.identity?.gitDir ?? '', this.options.id, operation),
      sendRepoList: () => this.sendRepoList(),
      sendSettingsData: (settings) => this.sendSettingsData(settings),
      markWhatsNewShown: () => this.shared.whatsNew.markShown(),
    };
  }

  private async readGitVersion(): Promise<GitVersion | null> {
    const result = await new GitConfigService(this.runtime.currentRepoPath, this.log).getGitVersion();
    return result.success ? parseGitVersion(result.value) : null;
  }

  private getBatchSize(): number {
    // Settings from the handler are already normalized; the direct-config
    // fallback is raw, so clamp here too.
    return this.options.getSettings().batchCommitSize
      ?? clampBatchCommitSize(
        vscode.workspace.getConfiguration('speedyGit').get<number>('batchCommitSize', DEFAULT_USER_SETTINGS.batchCommitSize),
      );
  }
}

export type GraphTabServiceSet = GitServiceSet;
