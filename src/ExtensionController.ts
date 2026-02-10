import * as vscode from 'vscode';
import { WebviewProvider } from './WebviewProvider.js';
import { GitLogService } from './services/GitLogService.js';
import { GitDiffService } from './services/GitDiffService.js';
import { GitBranchService } from './services/GitBranchService.js';

export class ExtensionController {
  private webviewProvider: WebviewProvider | undefined;
  private gitLogService: GitLogService | undefined;
  private gitDiffService: GitDiffService | undefined;
  private gitBranchService: GitBranchService | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async showGraph() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Speedy Git: No workspace folder open');
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;

    if (!this.gitLogService) {
      this.gitLogService = new GitLogService(workspacePath);
    }
    if (!this.gitDiffService) {
      this.gitDiffService = new GitDiffService(workspacePath);
    }
    if (!this.gitBranchService) {
      this.gitBranchService = new GitBranchService(workspacePath);
    }

    if (!this.webviewProvider) {
      this.webviewProvider = new WebviewProvider(
        this.context,
        this.gitLogService,
        this.gitDiffService,
        this.gitBranchService
      );
    }

    await this.webviewProvider.show();
  }

  dispose() {
    this.webviewProvider?.dispose();
    this.webviewProvider = undefined;
    this.gitLogService = undefined;
    this.gitDiffService = undefined;
    this.gitBranchService = undefined;
  }
}
