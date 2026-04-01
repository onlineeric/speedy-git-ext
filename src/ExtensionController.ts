import * as vscode from 'vscode';
import path from 'node:path';
import { WebviewProvider } from './WebviewProvider.js';
import { GitLogService } from './services/GitLogService.js';
import { GitDiffService } from './services/GitDiffService.js';
import { GitBranchService } from './services/GitBranchService.js';
import { GitRemoteService } from './services/GitRemoteService.js';
import { GitTagService } from './services/GitTagService.js';
import { GitStashService } from './services/GitStashService.js';
import { GitHistoryService } from './services/GitHistoryService.js';
import { GitCherryPickService } from './services/GitCherryPickService.js';
import { GitRevertService } from './services/GitRevertService.js';
import { GitRebaseService } from './services/GitRebaseService.js';
import { GitSignatureService } from './services/GitSignatureService.js';
import { GitSubmoduleService } from './services/GitSubmoduleService.js';
import { GitWorktreeService } from './services/GitWorktreeService.js';
import { GitShowContentProvider } from './GitShowContentProvider.js';
import { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';
import { GitWatcherService } from './services/GitWatcherService.js';
import { DEFAULT_GRAPH_COLORS, DEFAULT_USER_SETTINGS, type SubmoduleNavEntry, type UserDateFormat, type UserSettings } from '../shared/types.js';

export class ExtensionController {
  private webviewProvider: WebviewProvider | undefined;
  private gitLogService: GitLogService | undefined;
  private gitDiffService: GitDiffService | undefined;
  private gitBranchService: GitBranchService | undefined;
  private gitRemoteService: GitRemoteService | undefined;
  private gitTagService: GitTagService | undefined;
  private gitStashService: GitStashService | undefined;
  private gitHistoryService: GitHistoryService | undefined;
  private gitCherryPickService: GitCherryPickService | undefined;
  private gitRevertService: GitRevertService | undefined;
  private gitRebaseService: GitRebaseService | undefined;
  private gitSignatureService: GitSignatureService | undefined;
  private gitSubmoduleService: GitSubmoduleService | undefined;
  private gitWorktreeService: GitWorktreeService | undefined;
  private contentProviderRegistration: vscode.Disposable | undefined;
  private gitWatcherService: GitWatcherService | undefined;
  private gitRepoDiscoveryService: GitRepoDiscoveryService | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private currentRepoPath: string | undefined;
  private submoduleStack: SubmoduleNavEntry[] = [];
  private submoduleNavigating = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel
  ) {
    this.initRepoDiscovery();
    this.registerSettingsListener();
  }

  private initRepoDiscovery() {
    const discovery = new GitRepoDiscoveryService(this.log);
    this.gitRepoDiscoveryService = discovery;

    discovery.initialize().then(() => {
      this.updateStatusBar();

      // Subscribe to repo list changes
      this.context.subscriptions.push(
        discovery.onDidChangeRepos(() => {
          this.updateStatusBar();
          this.webviewProvider?.sendRepoList(
            discovery.getRepos(),
            discovery.getActiveRepoPath()
          );
        })
      );
    }).catch((err) => {
      this.log.error(`GitRepoDiscoveryService initialization failed: ${err}`);
    });

    // Create status bar item
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    statusBar.text = '$(zap) Speedy Git';
    statusBar.tooltip = 'Open Speedy Git';
    statusBar.command = 'speedyGit.showGraph';
    this.statusBarItem = statusBar;
    this.context.subscriptions.push(statusBar);

    // Update status bar command based on active editor
    this.context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.updateStatusBar();
      })
    );
  }

  private updateStatusBar() {
    if (!this.statusBarItem || !this.gitRepoDiscoveryService) return;
    const repos = this.gitRepoDiscoveryService.getRepos();
    if (repos.length === 0) {
      this.statusBarItem.hide();
      return;
    }
    this.statusBarItem.show();
  }

  switchActiveRepo(repoPath: string) {
    if (!this.gitRepoDiscoveryService) return;
    this.submoduleStack = [];
    this.gitRepoDiscoveryService.setActiveRepo(repoPath);
    this.reinitServices(repoPath);
  }

  private reinitServices(workspacePath: string) {
    this.currentRepoPath = workspacePath;
    this.gitLogService = new GitLogService(workspacePath, this.log);
    this.gitDiffService = new GitDiffService(workspacePath, this.log);
    this.gitBranchService = new GitBranchService(workspacePath, this.log);
    this.gitRemoteService = new GitRemoteService(workspacePath, this.log);
    this.gitTagService = new GitTagService(workspacePath, this.log);
    this.gitStashService = new GitStashService(workspacePath, this.log);
    this.gitHistoryService = new GitHistoryService(workspacePath, this.log);
    this.gitCherryPickService = new GitCherryPickService(workspacePath, this.log);
    this.gitRevertService = new GitRevertService(workspacePath, this.log);
    this.gitRebaseService = new GitRebaseService(workspacePath, this.log);
    this.gitSignatureService = new GitSignatureService(workspacePath, this.log);
    this.gitSubmoduleService = new GitSubmoduleService(workspacePath, this.log);
    this.gitWorktreeService = new GitWorktreeService(workspacePath, this.log);

    this.gitWatcherService?.setRepoPath(workspacePath);

    if (this.webviewProvider) {
      this.webviewProvider.updateServices(
        this.gitLogService,
        this.gitDiffService,
        this.gitBranchService,
        this.gitRemoteService,
        this.gitTagService,
        this.gitStashService,
        this.gitHistoryService,
        this.gitCherryPickService,
        this.gitRevertService,
        this.gitRebaseService,
        this.gitSignatureService,
        this.gitSubmoduleService,
        this.gitWorktreeService!,
        workspacePath
      );
    }
  }

  private registerSettingsListener() {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!this.didSpeedyGitSettingsChange(event)) {
          return;
        }

        this.webviewProvider?.sendSettingsData(this.readUserSettings());
      })
    );
  }

  async showGraph() {
    const discovery = this.gitRepoDiscoveryService;
    let workspacePath: string;

    if (discovery && discovery.getActiveRepoPath()) {
      workspacePath = discovery.getActiveRepoPath();
    } else {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('Speedy Git: No workspace folder open');
        return;
      }
      workspacePath = workspaceFolders[0].uri.fsPath;
    }

    this.log.info('Showing git graph');

    if (!this.gitLogService || this.currentRepoPath !== workspacePath) {
      this.reinitServices(workspacePath);
    }

    // Register git-show:// content provider for diff view
    if (!this.contentProviderRegistration) {
      const provider = new GitShowContentProvider(() => this.gitDiffService!);
      this.contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider(
        'git-show',
        provider
      );
      this.context.subscriptions.push(this.contentProviderRegistration);
    }

    if (!this.webviewProvider) {
      this.webviewProvider = new WebviewProvider(
        this.context,
        this.gitLogService!,
        this.gitDiffService!,
        this.gitBranchService!,
        this.gitRemoteService!,
        this.gitTagService!,
        this.gitStashService!,
        this.gitHistoryService!,
        this.gitCherryPickService!,
        this.gitRevertService!,
        this.gitRebaseService!,
        this.gitSignatureService!,
        this.gitSubmoduleService!,
        this.gitWorktreeService!,
        this.log,
        this.gitRepoDiscoveryService,
        workspacePath
      );
      this.webviewProvider.setSwitchRepoHandler((repoPath) => this.switchActiveRepo(repoPath));
      this.webviewProvider.setSettingsProvider(() => this.readUserSettings());
      this.webviewProvider.setSubmoduleNavigationHandlers({
        getStack: () => [...this.submoduleStack],
        openSubmodule: async (submodulePath) => {
          const repoPath = this.getCurrentRepoPath();
          if (!repoPath) return;
          this.submoduleStack = [
            ...this.submoduleStack,
            { repoPath, repoName: path.basename(repoPath) },
          ];
          this.reinitServices(path.resolve(repoPath, submodulePath));
        },
        backToParentRepo: async () => {
          if (this.submoduleNavigating) return;
          this.submoduleNavigating = true;
          try {
            const parent = this.submoduleStack.pop();
            if (!parent) return;
            this.reinitServices(parent.repoPath);
          } finally {
            this.submoduleNavigating = false;
          }
        },
      });
    }

    if (!this.gitWatcherService) {
      this.gitWatcherService = new GitWatcherService(this.log);
      this.context.subscriptions.push(this.gitWatcherService);
      this.gitWatcherService.onDidDetectChange(() => {
        this.webviewProvider?.triggerAutoRefresh().catch((err: unknown) => {
          this.log.error(`Auto-refresh failed: ${err}`);
        });
      });
      await this.gitWatcherService.initialize(workspacePath);
    }

    await this.webviewProvider.show();
  }

  /** Handler for speedyGit.openForRepo command (triggered from scm/title menu). */
  async openForRepo(sourceControl: vscode.SourceControl) {
    const repoPath = sourceControl.rootUri?.fsPath;
    if (!repoPath) return;
    const repoChanged = this.gitRepoDiscoveryService?.getActiveRepoPath() !== repoPath;
    this.switchActiveRepo(repoPath);
    // Capture before showGraph() potentially creates the provider/panel
    const panelWasOpen = this.webviewProvider?.isPanelOpen() ?? false;
    await this.showGraph();
    if (panelWasOpen && repoChanged && this.webviewProvider && this.gitRepoDiscoveryService) {
      // Panel was already open and repo changed: showGraph() only revealed it without reloading data.
      // Send updated repo list and reload commits for the new repo.
      this.webviewProvider.sendRepoList(
        this.gitRepoDiscoveryService.getRepos(),
        this.gitRepoDiscoveryService.getActiveRepoPath()
      );
      await this.webviewProvider.reload();
    }
  }

  dispose() {
    this.webviewProvider?.dispose();
    this.webviewProvider = undefined;
    this.contentProviderRegistration?.dispose();
    this.contentProviderRegistration = undefined;
    this.gitWatcherService?.dispose();
    this.gitWatcherService = undefined;
    this.gitLogService = undefined;
    this.gitDiffService = undefined;
    this.gitBranchService = undefined;
    this.gitRemoteService = undefined;
    this.gitTagService = undefined;
    this.gitStashService = undefined;
    this.gitHistoryService = undefined;
    this.gitCherryPickService = undefined;
    this.gitRevertService = undefined;
    this.gitRebaseService = undefined;
    this.gitSignatureService = undefined;
    this.gitSubmoduleService = undefined;
    this.gitWorktreeService = undefined;
    this.gitRepoDiscoveryService?.dispose();
    this.gitRepoDiscoveryService = undefined;
    this.statusBarItem?.dispose();
    this.statusBarItem = undefined;
    this.currentRepoPath = undefined;
    this.submoduleStack = [];
  }

  private getCurrentRepoPath(): string | undefined {
    return this.currentRepoPath
      ?? this.gitRepoDiscoveryService?.getActiveRepoPath()
      ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private didSpeedyGitSettingsChange(event: vscode.ConfigurationChangeEvent): boolean {
    return [
      'speedyGit.graphColors',
      'speedyGit.dateFormat',
      'speedyGit.avatars.enabled',
      'speedyGit.showRemoteBranches',
      'speedyGit.showTags',
      'speedyGit.batchCommitSize',
    ].some((section) => event.affectsConfiguration(section));
  }

  private readUserSettings(): UserSettings {
    const config = vscode.workspace.getConfiguration('speedyGit');
    const graphColors = this.normalizeGraphColors(
      config.get<unknown>('graphColors', [...DEFAULT_USER_SETTINGS.graphColors])
    );
    const dateFormat = this.normalizeDateFormat(
      config.get<string>('dateFormat', DEFAULT_USER_SETTINGS.dateFormat)
    );
    const batchCommitSize = this.normalizeBatchCommitSize(
      config.get<number>('batchCommitSize', DEFAULT_USER_SETTINGS.batchCommitSize)
    );
    const overScan = this.normalizeOverScan(
      config.get<number>('overScan', DEFAULT_USER_SETTINGS.overScan)
    );

    return {
      graphColors,
      dateFormat,
      avatarsEnabled: config.get<boolean>('avatars.enabled', DEFAULT_USER_SETTINGS.avatarsEnabled),
      showRemoteBranches: config.get<boolean>('showRemoteBranches', DEFAULT_USER_SETTINGS.showRemoteBranches),
      showTags: config.get<boolean>('showTags', DEFAULT_USER_SETTINGS.showTags),
      batchCommitSize,
      overScan,
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
    return value === 'absolute' ? 'absolute' : 'relative';
  }

  private normalizeBatchCommitSize(value: number): number {
    return Number.isFinite(value) && value >= 1 ? value : DEFAULT_USER_SETTINGS.batchCommitSize;
  }

  private normalizeOverScan(value: number): number {
    return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), 200) : DEFAULT_USER_SETTINGS.overScan;
  }
}

function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);
}
