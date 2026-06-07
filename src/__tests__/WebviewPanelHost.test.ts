import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebviewPanelHost } from '../webview/WebviewPanelHost.js';

const vscodeMock = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  joinPath: vi.fn((...parts: unknown[]) => ({ parts })),
  viewStateCallback: undefined as ((event: { webviewPanel: { visible: boolean } }) => void) | undefined,
  disposeCallback: undefined as (() => void) | undefined,
}));

vi.mock('vscode', () => ({
  ViewColumn: { One: 1 },
  window: {
    createWebviewPanel: vscodeMock.createWebviewPanel,
  },
  Uri: {
    joinPath: vscodeMock.joinPath,
  },
}));

function createPanel() {
  const panel = {
    visible: true,
    iconPath: undefined,
    reveal: vi.fn(),
    dispose: vi.fn(),
    webview: {
      html: '',
      cspSource: 'vscode-resource',
      asWebviewUri: vi.fn((uri: unknown) => uri),
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn(),
    },
    onDidChangeViewState: vi.fn((callback) => {
      vscodeMock.viewStateCallback = callback;
    }),
    onDidDispose: vi.fn((callback) => {
      vscodeMock.disposeCallback = callback;
    }),
  };
  vscodeMock.createWebviewPanel.mockReturnValue(panel);
  return panel;
}

describe('WebviewPanelHost', () => {
  beforeEach(() => {
    vscodeMock.createWebviewPanel.mockClear();
    vscodeMock.joinPath.mockClear();
    vscodeMock.viewStateCallback = undefined;
    vscodeMock.disposeCallback = undefined;
  });

  it('creates the panel, wires callbacks, and posts messages through the webview', () => {
    const panel = createPanel();
    const host = new WebviewPanelHost(
      { extensionUri: { fsPath: '/extension' }, subscriptions: [] } as never,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    );
    const callbacks = {
      onMessage: vi.fn(),
      onVisibilityChanged: vi.fn(),
      onDisposed: vi.fn(),
    };

    host.show(callbacks);
    host.postMessage({ type: 'loading', payload: { loading: true } });

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'speedyGit',
      'Speedy Git',
      vscode.ViewColumn.One,
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(panel.webview.html).toContain('<div id="root"></div>');
    expect(panel.webview.onDidReceiveMessage).toHaveBeenCalledWith(
      callbacks.onMessage,
      undefined,
      [],
    );
    expect(callbacks.onVisibilityChanged).toHaveBeenCalledWith(true);
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading', payload: { loading: true } });
  });

  it('reveals an existing panel instead of creating another', () => {
    const panel = createPanel();
    const host = new WebviewPanelHost(
      { extensionUri: { fsPath: '/extension' }, subscriptions: [] } as never,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    );
    const callbacks = {
      onMessage: vi.fn(),
      onVisibilityChanged: vi.fn(),
      onDisposed: vi.fn(),
    };

    host.show(callbacks);
    host.show(callbacks);

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledTimes(1);
  });

  it('updates visibility and dispose callbacks from VS Code panel events', () => {
    createPanel();
    const host = new WebviewPanelHost(
      { extensionUri: { fsPath: '/extension' }, subscriptions: [] } as never,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    );
    const callbacks = {
      onMessage: vi.fn(),
      onVisibilityChanged: vi.fn(),
      onDisposed: vi.fn(),
    };

    host.show(callbacks);
    vscodeMock.viewStateCallback?.({ webviewPanel: { visible: false } });
    vscodeMock.disposeCallback?.();

    expect(callbacks.onVisibilityChanged).toHaveBeenCalledWith(false);
    expect(callbacks.onDisposed).toHaveBeenCalledTimes(1);
    expect(host.isOpen()).toBe(false);
  });
});
