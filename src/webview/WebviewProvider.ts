import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../../shared/messages.js';
import type { RepoInfo, SubmoduleNavEntry, UserSettings } from '../../shared/types.js';
import type { GitBranchService } from '../services/GitBranchService.js';
import type { GitCherryPickService } from '../services/GitCherryPickService.js';
import type { GitDiffService } from '../services/GitDiffService.js';
import type { GitHistoryService } from '../services/GitHistoryService.js';
import type { GitIndexService } from '../services/GitIndexService.js';
import type { GitLogService } from '../services/GitLogService.js';
import type { GitRebaseService } from '../services/GitRebaseService.js';
import type { GitRemoteService } from '../services/GitRemoteService.js';
import type { GitRepoDiscoveryService } from '../services/GitRepoDiscoveryService.js';
import type { GitRevertService } from '../services/GitRevertService.js';
import type { GitSignatureService } from '../services/GitSignatureService.js';
import type { GitStashService } from '../services/GitStashService.js';
import type { GitSubmoduleService } from '../services/GitSubmoduleService.js';
import type { GitTagService } from '../services/GitTagService.js';
import type { GitWorktreeService } from '../services/GitWorktreeService.js';
import type { TelemetryService } from '../services/TelemetryService.js';
import { AvatarCacheStore } from '../services/AvatarCacheStore.js';
import { AvatarRefreshQueue } from '../services/AvatarRefreshQueue.js';
import { GitHubAuthService, type AvatarAuthChange } from '../services/GitHubAuthService.js';
import { GitHubAvatarService } from '../services/GitHubAvatarService.js';
import { clampBatchCommitSize, DEFAULT_USER_SETTINGS } from '../../shared/types.js';
import { EditorCommandService } from './EditorCommandService.js';
import { GitServiceRegistry, type GitServiceSet } from './GitServiceRegistry.js';
import { OperationGuard } from './OperationGuard.js';
import { PersistedUIStateStore } from './PersistedUIStateStore.js';
import { RefreshCoordinator } from './RefreshCoordinator.js';
import { RepoDataLoader, type SubmoduleNavigationHandlers } from './RepoDataLoader.js';
import { WebviewMessageRouter } from './WebviewMessageRouter.js';
import { WebviewPanelHost } from './WebviewPanelHost.js';
import type { WebviewRequestContext } from './WebviewRequestContext.js';
import { WebviewRuntime } from './WebviewRuntime.js';

export class WebviewProvider {
  private readonly runtime: WebviewRuntime;
  private readonly services: GitServiceRegistry;
  private readonly uiStateStore: PersistedUIStateStore;
  private readonly panelHost: WebviewPanelHost;
  private readonly dataLoader: RepoDataLoader;
  private readonly refreshCoordinator: RefreshCoordinator;
  private readonly editorCommands: EditorCommandService;
  private readonly operationGuard: OperationGuard;
  private readonly router: WebviewMessageRouter;
  private readonly avatarCache: AvatarCacheStore;
  private readonly avatarAuth: GitHubAuthService;
  private readonly avatarService: GitHubAvatarService;
  private readonly avatarQueue: AvatarRefreshQueue;
  private getSettingsHandler: (() => UserSettings) | undefined;
  private submoduleHandlers: SubmoduleNavigationHandlers | undefined;
  private onSwitchRepo: ((repoPath: string) => void) | undefined;
  private onDisplayRepo: ((repoPath: string) => void) | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    gitLogService: GitLogService,
    gitDiffService: GitDiffService,
    gitBranchService: GitBranchService,
    gitRemoteService: GitRemoteService,
    gitTagService: GitTagService,
    gitStashService: GitStashService,
    gitHistoryService: GitHistoryService,
    gitCherryPickService: GitCherryPickService,
    gitRevertService: GitRevertService,
    gitRebaseService: GitRebaseService,
    gitSignatureService: GitSignatureService,
    gitSubmoduleService: GitSubmoduleService,
    gitWorktreeService: GitWorktreeService,
    gitIndexService: GitIndexService,
    private readonly log: vscode.LogOutputChannel,
    private readonly telemetry: TelemetryService,
    private readonly gitRepoDiscoveryService?: GitRepoDiscoveryService,
    currentRepoPath?: string,
  ) {
    this.runtime = new WebviewRuntime(currentRepoPath ?? this.getWorkspacePath() ?? '');
    this.services = new GitServiceRegistry({
      gitLogService,
      gitDiffService,
      gitBranchService,
      gitRemoteService,
      gitTagService,
      gitStashService,
      gitHistoryService,
      gitCherryPickService,
      gitRevertService,
      gitRebaseService,
      gitSignatureService,
      gitSubmoduleService,
      gitWorktreeService,
      gitIndexService,
    });
    this.uiStateStore = new PersistedUIStateStore(this.context, () => this.runtime.currentRepoPath);
    this.panelHost = new WebviewPanelHost(this.context, this.log);

    // Avatar subsystem. Deliberately owned here rather than by RepoDataLoader:
    // the cache and queue are account-scoped and must outlive repo switches.
    this.avatarCache = new AvatarCacheStore(this.context, this.log);
    this.avatarAuth = new GitHubAuthService(this.context, this.log, (change) => this.onAvatarAuthChanged(change));
    this.avatarService = new GitHubAvatarService();
    this.avatarQueue = new AvatarRefreshQueue({
      log: this.log,
      cache: this.avatarCache,
      auth: this.avatarAuth,
      avatarService: this.avatarService,
      postAvatarUrls: (urls) => this.postMessage({ type: 'avatarUrls', payload: { urls } }),
      onRateLimitChanged: () => this.sendAvatarAuthState(),
      // Untracked-path failure (FR-014): functional area + standardized code
      // only — never the email, hash, repo or GitHub's response.
      onLookupFailed: () => this.telemetry.sendError('avatarService', 'COMMAND_FAILED'),
    });
    void this.avatarAuth.initialize();

    this.dataLoader = new RepoDataLoader({
      log: this.log,
      runtime: this.runtime,
      services: this.services,
      uiStateStore: this.uiStateStore,
      avatarCache: this.avatarCache,
      avatarQueue: this.avatarQueue,
      isAvatarAuthorized: () => this.avatarAuth.isOptedIn(),
      postMessage: (message) => this.postMessage(message),
      getSettings: () => this.getSettingsHandler?.(),
      getBatchSize: () => this.getBatchSize(),
      getSubmoduleHandlers: () => this.submoduleHandlers,
      telemetry: this.telemetry,
    });
    this.refreshCoordinator = new RefreshCoordinator(this.log, this.dataLoader);
    this.editorCommands = new EditorCommandService(this.log, this.context.extensionUri, this.runtime, this.services);
    this.operationGuard = new OperationGuard(this.services);
    this.router = new WebviewMessageRouter(this.log, this.createRequestContext());
  }

  setSwitchRepoHandler(handler: (repoPath: string) => void): void {
    this.onSwitchRepo = handler;
  }

  setDisplayRepoHandler(handler: (repoPath: string) => void): void {
    this.onDisplayRepo = handler;
  }

  setSettingsProvider(handler: () => UserSettings): void {
    this.getSettingsHandler = handler;
  }

  setSubmoduleNavigationHandlers(handlers: {
    getStack: () => SubmoduleNavEntry[];
    openSubmodule: (submodulePath: string) => Promise<void> | void;
    backToParentRepo: () => Promise<void> | void;
  }): void {
    this.submoduleHandlers = handlers;
  }

  updateServices(
    gitLogService: GitLogService,
    gitDiffService: GitDiffService,
    gitBranchService: GitBranchService,
    gitRemoteService: GitRemoteService,
    gitTagService: GitTagService,
    gitStashService: GitStashService,
    gitHistoryService: GitHistoryService,
    gitCherryPickService: GitCherryPickService,
    gitRevertService: GitRevertService,
    gitRebaseService: GitRebaseService,
    gitSignatureService: GitSignatureService,
    gitSubmoduleService: GitSubmoduleService,
    gitWorktreeService: GitWorktreeService,
    gitIndexService: GitIndexService,
    currentRepoPath: string,
  ): void {
    this.services.update({
      gitLogService,
      gitDiffService,
      gitBranchService,
      gitRemoteService,
      gitTagService,
      gitStashService,
      gitHistoryService,
      gitCherryPickService,
      gitRevertService,
      gitRebaseService,
      gitSignatureService,
      gitSubmoduleService,
      gitWorktreeService,
      gitIndexService,
    });
    this.runtime.resetRepoScopedState(currentRepoPath);
    this.uiStateStore.invalidateCache();
    this.dataLoader.resetRepoScopedState();
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

  sendRepoList(repos: RepoInfo[], activeRepoPath: string): void {
    this.postMessage({ type: 'repoList', payload: { repos, activeRepoPath } });
  }

  sendSettingsData(settings: UserSettings): void {
    this.postMessage({ type: 'settingsData', payload: { settings } });
  }

  async show(): Promise<void> {
    const wasOpen = this.panelHost.isOpen();
    this.panelHost.show({
      onMessage: (message) => {
        this.handleMessage(message).catch((error) => {
          this.log.error(`Error handling message: ${message.type} — ${error}`);
          this.postMessage({
            type: 'error',
            payload: { error: { message: String(error) } },
          });
        });
      },
      onVisibilityChanged: (visible) => this.refreshCoordinator.setPanelVisible(visible),
      onDisposed: () => this.handlePanelDisposed(),
    });

    if (wasOpen) return;

    if (this.gitRepoDiscoveryService) {
      this.sendRepoList(
        this.gitRepoDiscoveryService.getRepos(),
        this.gitRepoDiscoveryService.getActiveRepoPath(),
      );
    }

    await this.refreshCoordinator.reload();
  }

  dispose(): void {
    this.panelHost.dispose();
    this.avatarQueue.dispose();
    // Flush whatever the queue resolved since the last debounced write, so a
    // shutdown never throws away avatars we already spent API budget on.
    this.avatarCache.dispose();
  }

  /**
   * Authorizing raises the rate limit and grants private-repo access, so every
   * email that failed while unauthenticated is worth retrying now rather than
   * after the refresh window.
   *
   * Re-opening cached answers happens only on `granted`. Restoring the session
   * at startup, or an unrelated GitHub session event, reports `refreshed` — the
   * cached answers were obtained under the very same authorization, so
   * re-opening them there would discard the whole negative cache on every window
   * reload and re-spend the API budget.
   *
   * Retiring the tracked rate limit is the wider case: `revoked` retires it too,
   * because the budget belongs to whoever spent it and both directions of the
   * flip leave us spending someone else's. Announcing the new state afterwards
   * is what takes the "limit reached" notice down.
   */
  private onAvatarAuthChanged(change: AvatarAuthChange): void {
    if (change !== 'refreshed') this.avatarQueue.onIdentityChanged();

    this.sendAvatarAuthState();
    if (change !== 'granted') return;

    const reopened = this.avatarCache.reopenUnresolved();
    if (reopened.length > 0) {
      // Cleared their `refreshedOn`, so they are expired again — the next load
      // supplies fresh lookup recipes and re-queues them.
      this.log.info(`GitHub avatars: ${reopened.length} unresolved email(s) will retry after authorization`);
      void this.refreshCoordinator.reload();
    }
  }

  private sendAvatarAuthState(): void {
    const rateLimit = this.avatarService.getRateLimit();
    const limited = this.avatarService.isRateLimited(Date.now());
    this.postMessage({
      type: 'avatarAuthState',
      payload: {
        authorized: this.avatarAuth.isOptedIn(),
        accountLabel: this.avatarAuth.accountLabel,
        rateLimitResetAt: limited ? rateLimit.resetAt : null,
      },
    });
  }

  private async handleMessage(message: RequestMessage): Promise<void> {
    await this.router.dispatch(message);
  }

  private createRequestContext(): WebviewRequestContext {
    return {
      log: this.log,
      extensionUri: this.context.extensionUri,
      runtime: this.runtime,
      services: this.services,
      dataLoader: this.dataLoader,
      refreshCoordinator: this.refreshCoordinator,
      editorCommands: this.editorCommands,
      operationGuard: this.operationGuard,
      uiStateStore: this.uiStateStore,
      telemetry: this.telemetry,
      avatarAuth: this.avatarAuth,
      postMessage: (message) => this.postMessage(message),
      sendAvatarAuthState: () => this.sendAvatarAuthState(),
      clearAvatarCache: async () => {
        this.avatarQueue.clear();
        await this.avatarCache.clear();
        this.log.info('GitHub avatar cache cleared');
      },
      getSettings: () => this.getSettingsHandler?.(),
      getBatchSize: () => this.getBatchSize(),
      getRepoDiscovery: () => this.gitRepoDiscoveryService,
      getSubmoduleHandlers: () => this.submoduleHandlers,
      onSwitchRepo: (repoPath) => this.onSwitchRepo?.(repoPath),
      onDisplayRepo: (repoPath) => this.onDisplayRepo?.(repoPath),
      sendRepoList: (repos, activeRepoPath) => this.sendRepoList(repos, activeRepoPath),
      sendSettingsData: (settings) => this.sendSettingsData(settings),
    };
  }

  private handlePanelDisposed(): void {
    this.runtime.initialLoadSent = false;
    if (this.runtime.isDisplayingSubmodule) {
      this.runtime.isDisplayingSubmodule = false;
      const parentPath = this.gitRepoDiscoveryService?.getActiveRepoPath();
      if (parentPath) {
        this.onDisplayRepo?.(parentPath);
      }
    }
  }

  private postMessage(message: ResponseMessage): void {
    this.panelHost.postMessage(message);
  }

  private getWorkspacePath(): string | undefined {
    if (this.runtime?.currentRepoPath) {
      return this.runtime.currentRepoPath;
    }
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  private getBatchSize(): number {
    // Settings from the handler are already normalized; the direct-config
    // fallback is raw, so clamp here too.
    return this.getSettingsHandler?.().batchCommitSize
      ?? clampBatchCommitSize(
        vscode.workspace.getConfiguration('speedyGit').get<number>('batchCommitSize', DEFAULT_USER_SETTINGS.batchCommitSize)
      );
  }
}

export type WebviewProviderServiceSet = GitServiceSet;
