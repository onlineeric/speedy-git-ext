import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../../shared/messages.js';

export interface WebviewPanelHostCallbacks {
  onMessage: (message: RequestMessage) => void;
  onVisibilityChanged: (visible: boolean) => void;
  onDisposed: () => void;
}

export class WebviewPanelHost {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  show(callbacks: WebviewPanelHostCallbacks): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'speedyGit',
      'Speedy Git',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ],
      },
    );

    this.panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      'resources',
      'speedy-git-ext-icon-128.png',
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(
      callbacks.onMessage,
      undefined,
      this.context.subscriptions,
    );

    callbacks.onVisibilityChanged(true);

    this.panel.onDidChangeViewState((event) => {
      callbacks.onVisibilityChanged(event.webviewPanel.visible);
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      callbacks.onVisibilityChanged(false);
      callbacks.onDisposed();
    });
  }

  isOpen(): boolean {
    return this.panel !== undefined;
  }

  isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  postMessage(message: ResponseMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.css'),
    );
    const nonce = getNonce();

    this.log.debug('Generated Speedy Git webview HTML');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https://www.gravatar.com https://secure.gravatar.com https://avatars.githubusercontent.com;">
  <link rel="stylesheet" href="${styleUri}">
  <title>Speedy Git</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
