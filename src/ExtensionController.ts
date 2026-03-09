import * as vscode from 'vscode';
import { WebviewProvider } from './WebviewProvider.js';
import { GitLogService } from './services/GitLogService.js';
import { GitDiffService } from './services/GitDiffService.js';
import { GitBranchService } from './services/GitBranchService.js';
import { GitRemoteService } from './services/GitRemoteService.js';
import { GitTagService } from './services/GitTagService.js';
import { GitStashService } from './services/GitStashService.js';
import { GitHistoryService } from './services/GitHistoryService.js';
import { GitCherryPickService } from './services/GitCherryPickService.js';
import { GitRebaseService } from './services/GitRebaseService.js';
import { GitShowContentProvider } from './GitShowContentProvider.js';
import { GitRepoDiscoveryService } from './services/GitRepoDiscoveryService.js';

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
  private gitRebaseService: GitRebaseService | undefined;
  private contentProviderRegistration: vscode.Disposable | undefined;
  private gitRepoDiscoveryService: GitRepoDiscoveryService | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel
  ) {
    this.initRepoDiscovery();
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
    statusBar.tooltip = 'Open Speedy Git Graph';
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
    this.gitRepoDiscoveryService.setActiveRepo(repoPath);
    this.reinitServices(repoPath);
  }

  private reinitServices(workspacePath: string) {
    this.gitLogService = new GitLogService(workspacePath, this.log);
    this.gitDiffService = new GitDiffService(workspacePath, this.log);
    this.gitBranchService = new GitBranchService(workspacePath, this.log);
    this.gitRemoteService = new GitRemoteService(workspacePath, this.log);
    this.gitTagService = new GitTagService(workspacePath, this.log);
    this.gitStashService = new GitStashService(workspacePath, this.log);
    this.gitHistoryService = new GitHistoryService(workspacePath, this.log);
    this.gitCherryPickService = new GitCherryPickService(workspacePath, this.log);
    this.gitRebaseService = new GitRebaseService(workspacePath, this.log);

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
        this.gitRebaseService
      );
    }
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

    if (!this.gitLogService) {
      this.gitLogService = new GitLogService(workspacePath, this.log);
    }
    if (!this.gitDiffService) {
      this.gitDiffService = new GitDiffService(workspacePath, this.log);
    }
    if (!this.gitBranchService) {
      this.gitBranchService = new GitBranchService(workspacePath, this.log);
    }
    if (!this.gitRemoteService) {
      this.gitRemoteService = new GitRemoteService(workspacePath, this.log);
    }
    if (!this.gitTagService) {
      this.gitTagService = new GitTagService(workspacePath, this.log);
    }
    if (!this.gitStashService) {
      this.gitStashService = new GitStashService(workspacePath, this.log);
    }
    if (!this.gitHistoryService) {
      this.gitHistoryService = new GitHistoryService(workspacePath, this.log);
    }
    if (!this.gitCherryPickService) {
      this.gitCherryPickService = new GitCherryPickService(workspacePath, this.log);
    }
    if (!this.gitRebaseService) {
      this.gitRebaseService = new GitRebaseService(workspacePath, this.log);
    }

    // Register git-show:// content provider for diff view
    if (!this.contentProviderRegistration) {
      const provider = new GitShowContentProvider(this.gitDiffService);
      this.contentProviderRegistration = vscode.workspace.registerTextDocumentContentProvider(
        'git-show',
        provider
      );
      this.context.subscriptions.push(this.contentProviderRegistration);
    }

    if (!this.webviewProvider) {
      this.webviewProvider = new WebviewProvider(
        this.context,
        this.gitLogService,
        this.gitDiffService,
        this.gitBranchService,
        this.gitRemoteService,
        this.gitTagService,
        this.gitStashService,
        this.gitHistoryService,
        this.gitCherryPickService,
        this.gitRebaseService,
        this.log,
        this.gitRepoDiscoveryService
      );
      this.webviewProvider.setSwitchRepoHandler((repoPath) => this.reinitServices(repoPath));
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
    this.gitLogService = undefined;
    this.gitDiffService = undefined;
    this.gitBranchService = undefined;
    this.gitRemoteService = undefined;
    this.gitTagService = undefined;
    this.gitStashService = undefined;
    this.gitHistoryService = undefined;
    this.gitCherryPickService = undefined;
    this.gitRebaseService = undefined;
    this.gitRepoDiscoveryService?.dispose();
    this.gitRepoDiscoveryService = undefined;
    this.statusBarItem?.dispose();
    this.statusBarItem = undefined;
  }
}
