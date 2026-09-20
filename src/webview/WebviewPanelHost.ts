import * as vscode from 'vscode';
import type { RequestMessage, ResponseMessage } from '../../shared/messages.js';

export interface WebviewPanelViewState {
  /** Rendered somewhere on screen — what refresh deferral keys off. */
  visible: boolean;
  /** Focused — what the most-recently-used tab order keys off. */
  active: boolean;
}

export interface WebviewPanelHostCallbacks {
  onMessage: (message: RequestMessage) => void;
  onViewStateChanged: (state: WebviewPanelViewState) => void;
  onDisposed: () => void;
}

export interface WebviewPanelHostCreateOptions extends WebviewPanelHostCallbacks {
  viewColumn: vscode.ViewColumn;
  title: string;
}

/**
 * One editor panel. There is one host per graph tab, so nothing here may assume
 * it is the only panel: `create` always creates, and `reveal` never moves a
 * panel between editor groups.
 */
export class WebviewPanelHost {
  private panel: vscode.WebviewPanel | undefined;
  /**
   * Panel subscriptions live here rather than in `context.subscriptions`, which
   * with N tabs would accumulate one entry per closed panel for the whole
   * session and never release them.
   */
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  create(options: WebviewPanelHostCreateOptions): void {
    if (this.panel) return;

    this.panel = vscode.window.createWebviewPanel(
      'speedyGit',
      options.title,
      options.viewColumn,
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

    this.disposables.push(this.panel.webview.onDidReceiveMessage(options.onMessage));

    options.onViewStateChanged({ visible: true, active: true });

    this.disposables.push(
      this.panel.onDidChangeViewState((event) => {
        options.onViewStateChanged({
          visible: event.webviewPanel.visible,
          active: event.webviewPanel.active,
        });
      }),
    );

    this.disposables.push(
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        options.onViewStateChanged({ visible: false, active: false });
        this.disposeSubscriptions();
        options.onDisposed();
      }),
    );
  }

  /**
   * Bring this panel forward **in the group it currently occupies** — passing
   * `undefined` for the column is what stops a reveal from dragging a graph
   * back out of the editor group the user moved it to.
   */
  reveal(preserveFocus = false): void {
    this.panel?.reveal(undefined, preserveFocus);
  }

  setTitle(title: string): void {
    if (this.panel) this.panel.title = title;
  }

  /** `undefined` while the panel is hidden — callers fall back to `ViewColumn.Active`. */
  get viewColumn(): vscode.ViewColumn | undefined {
    return this.panel?.viewColumn;
  }

  /** Safe after disposal: a result arriving for a closed tab simply goes nowhere. */
  postMessage(message: ResponseMessage): void {
    void this.panel?.webview.postMessage(message);
  }

  dispose(): void {
    const panel = this.panel;
    this.panel = undefined;
    this.disposeSubscriptions();
    panel?.dispose();
  }

  private disposeSubscriptions(): void {
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
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
