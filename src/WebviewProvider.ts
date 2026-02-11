import * as vscode from 'vscode';
import * as path from 'path';
import type { RequestMessage, ResponseMessage } from '../shared/messages.js';
import type { GitLogService } from './services/GitLogService.js';
import type { GitDiffService } from './services/GitDiffService.js';
import type { GitBranchService } from './services/GitBranchService.js';

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gitLogService: GitLogService,
    private readonly gitDiffService: GitDiffService,
    private readonly gitBranchService: GitBranchService
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
          console.error('[SpeedyGit] Error handling message:', message.type, error);
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

  private async sendInitialData() {
    await this.handleMessage({ type: 'getCommits', payload: {} });
    await this.handleMessage({ type: 'getBranches', payload: {} });
  }

  private async handleMessage(message: RequestMessage) {
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
          // Refresh after checkout
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
          await this.sendInitialData();
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
        await this.sendInitialData();
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
      // Fallback: open the file directly if diff fails (e.g., newly added file)
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
