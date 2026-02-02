import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../shared/messages.js';
import type { GitLogService } from './services/GitLogService.js';

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly gitLogService: GitLogService
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
      (message: RequestMessage) => this.handleMessage(message),
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
      case 'refresh': {
        await this.sendInitialData();
        break;
      }
    }
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
