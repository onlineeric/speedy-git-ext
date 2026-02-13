import * as vscode from 'vscode';
import * as path from 'path';
import type { RequestMessage, ResponseMessage } from '../shared/messages.js';
import type { GitLogService } from './services/GitLogService.js';
import type { GitDiffService } from './services/GitDiffService.js';
import type { GitBranchService } from './services/GitBranchService.js';
import type { GitRemoteService } from './services/GitRemoteService.js';
import type { GitTagService } from './services/GitTagService.js';
import type { GitStashService } from './services/GitStashService.js';

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gitLogService: GitLogService,
    private readonly gitDiffService: GitDiffService,
    private readonly gitBranchService: GitBranchService,
    private readonly gitRemoteService: GitRemoteService,
    private readonly gitTagService: GitTagService,
    private readonly gitStashService: GitStashService,
    private readonly log: vscode.LogOutputChannel
  ) {}

  async show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'speedyGitGraph',
      'Speedy Git Graph',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ],
      }
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      (message: RequestMessage) => {
        this.handleMessage(message).catch((error) => {
          this.log.error(`Error handling message: ${message.type} — ${error}`);
          this.postMessage({
            type: 'error',
            payload: { error: { message: String(error) } },
          });
        });
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    await this.sendInitialData();
  }

  private async sendInitialData(filters?: Partial<import('../shared/types.js').GraphFilters>) {
    await this.handleMessage({ type: 'getCommits', payload: { filters } });
    await this.handleMessage({ type: 'getBranches', payload: {} });
    await this.handleMessage({ type: 'getStashes', payload: {} });
  }

  private async handleMessage(message: RequestMessage) {
    this.log.debug(`Received message: ${message.type}`);
    switch (message.type) {
      case 'getCommits': {
        this.postMessage({ type: 'loading', payload: { loading: true } });
        const result = await this.gitLogService.getCommits(message.payload.filters);
        if (result.success) {
          this.postMessage({ type: 'commits', payload: { commits: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        this.postMessage({ type: 'loading', payload: { loading: false } });
        break;
      }
      case 'getBranches': {
        const result = await this.gitLogService.getBranches();
        if (result.success) {
          this.postMessage({ type: 'branches', payload: { branches: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getCommitDetails': {
        const result = await this.gitDiffService.getCommitDetails(message.payload.hash);
        if (result.success) {
          this.postMessage({ type: 'commitDetails', payload: { details: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'checkoutBranch': {
        const result = await this.gitBranchService.checkout(
          message.payload.name,
          message.payload.remote
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'fetch': {
        const result = await this.gitBranchService.fetch(
          message.payload.remote,
          message.payload.prune
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData(message.payload.filters);
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'copyToClipboard': {
        await vscode.env.clipboard.writeText(message.payload.text);
        this.postMessage({ type: 'success', payload: { message: 'Copied to clipboard' } });
        break;
      }
      case 'openDiff': {
        await this.openDiffEditor(message.payload.hash, message.payload.filePath, message.payload.parentHash);
        break;
      }
      case 'openFile': {
        await this.openFileAtRevision(message.payload.hash, message.payload.filePath);
        break;
      }
      case 'refresh': {
        await this.sendInitialData(message.payload.filters);
        break;
      }
      // Branch ops
      case 'createBranch': {
        const result = await this.gitBranchService.createBranch(
          message.payload.name,
          message.payload.startPoint
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'renameBranch': {
        const result = await this.gitBranchService.renameBranch(
          message.payload.oldName,
          message.payload.newName
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteBranch': {
        const result = await this.gitBranchService.deleteBranch(
          message.payload.name,
          message.payload.force
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteRemoteBranch': {
        const result = await this.gitBranchService.deleteRemoteBranch(
          message.payload.remote,
          message.payload.name
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'mergeBranch': {
        const result = await this.gitBranchService.merge(
          message.payload.branch,
          message.payload.noFastForward,
          message.payload.squash
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Remote ops
      case 'push': {
        const result = await this.gitRemoteService.push(
          message.payload.remote,
          message.payload.branch,
          message.payload.setUpstream,
          message.payload.force
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'pull': {
        const result = await this.gitRemoteService.pull(
          message.payload.remote,
          message.payload.branch,
          message.payload.rebase
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'getRemotes': {
        const result = await this.gitRemoteService.getRemotes();
        if (result.success) {
          this.postMessage({ type: 'remotes', payload: { remotes: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'addRemote': {
        const result = await this.gitRemoteService.addRemote(
          message.payload.name,
          message.payload.url
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'removeRemote': {
        const result = await this.gitRemoteService.removeRemote(message.payload.name);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'editRemote': {
        const result = await this.gitRemoteService.editRemote(
          message.payload.name,
          message.payload.newUrl
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Tag ops
      case 'createTag': {
        const result = await this.gitTagService.createTag(
          message.payload.name,
          message.payload.hash,
          message.payload.message
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'deleteTag': {
        const result = await this.gitTagService.deleteTag(message.payload.name);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'pushTag': {
        const result = await this.gitTagService.pushTag(
          message.payload.name,
          message.payload.remote
        );
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      // Stash ops
      case 'getStashes': {
        const result = await this.gitStashService.getStashes();
        if (result.success) {
          this.postMessage({ type: 'stashes', payload: { stashes: result.value } });
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'applyStash': {
        const result = await this.gitStashService.applyStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'popStash': {
        const result = await this.gitStashService.popStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
      case 'dropStash': {
        const result = await this.gitStashService.dropStash(message.payload.index);
        if (result.success) {
          this.postMessage({ type: 'success', payload: { message: result.value } });
          await this.sendInitialData();
        } else {
          this.postMessage({ type: 'error', payload: { error: result.error } });
        }
        break;
      }
    }
  }

  private async openDiffEditor(hash: string, filePath: string, parentHash?: string) {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    // Validate path stays within repo
    const resolvedPath = path.resolve(workspacePath, filePath);
    if (!resolvedPath.startsWith(workspacePath)) return;

    const parent = parentHash ?? `${hash}~1`;
    const leftUri = vscode.Uri.parse(`git-show://${parent}/${filePath}?${parent}`);
    const rightUri = vscode.Uri.parse(`git-show://${hash}/${filePath}?${hash}`);

    const title = `${filePath} (${hash.slice(0, 7)})`;

    try {
      await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
    } catch {
      this.log.warn(`Diff editor failed, falling back to file view: ${filePath}`);
      await this.openFileAtRevision(hash, filePath);
    }
  }

  private async openFileAtRevision(hash: string, filePath: string) {
    const workspacePath = this.getWorkspacePath();
    if (!workspacePath) return;

    const resolvedPath = path.resolve(workspacePath, filePath);
    if (!resolvedPath.startsWith(workspacePath)) return;

    const uri = vscode.Uri.parse(`git-show://${hash}/${filePath}?${hash}`);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview: true });
    } catch {
      // File might not exist at this revision
      vscode.window.showWarningMessage(`Could not open ${filePath} at revision ${hash.slice(0, 7)}`);
    }
  }

  private getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  private postMessage(message: ResponseMessage) {
    this.panel?.webview.postMessage(message);
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.css')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Speedy Git Graph</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    this.panel?.dispose();
    this.panel = undefined;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
