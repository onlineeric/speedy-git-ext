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

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel
  ) {}

  async showGraph() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Speedy Git: No workspace folder open');
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
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
        this.log
      );
    }

    await this.webviewProvider.show();
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
  }
}
