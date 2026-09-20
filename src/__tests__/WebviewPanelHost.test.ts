import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebviewPanelHost } from '../webview/WebviewPanelHost.js';

const vscodeMock = vi.hoisted(() => ({
  createWebviewPanel: vi.fn(),
  joinPath: vi.fn((...parts: unknown[]) => ({ parts })),
  file: vi.fn((fsPath: string) => ({ fsPath })),
}));

vi.mock('vscode', () => ({
  ViewColumn: { One: 1, Two: 2, Active: -1 },
  window: {
    createWebviewPanel: vscodeMock.createWebviewPanel,
  },
  Uri: {
    joinPath: vscodeMock.joinPath,
    file: vscodeMock.file,
  },
}));

interface PanelHandles {
  viewState?: (event: { webviewPanel: { visible: boolean; active: boolean } }) => void;
  dispose?: () => void;
}

function createPanel(handles: PanelHandles = {}) {
  const subscriptionDisposals = { count: 0 };
  const track = () => ({ dispose: vi.fn(() => { subscriptionDisposals.count += 1; }) });

  const panel = {
    visible: true,
    active: true,
    viewColumn: 1 as vscode.ViewColumn | undefined,
    title: '',
    iconPath: undefined,
    reveal: vi.fn(),
    dispose: vi.fn(),
    subscriptionDisposals,
    webview: {
      html: '',
      cspSource: 'vscode-resource',
      asWebviewUri: vi.fn((uri: unknown) => uri),
      postMessage: vi.fn(),
      onDidReceiveMessage: vi.fn(() => track()),
    },
    onDidChangeViewState: vi.fn((callback) => {
      handles.viewState = callback;
      return track();
    }),
    onDidDispose: vi.fn((callback) => {
      handles.dispose = callback;
      return track();
    }),
  };
  vscodeMock.createWebviewPanel.mockReturnValue(panel);
  return panel;
}

function createHost(subscriptions: unknown[] = []) {
  return new WebviewPanelHost(
    { extensionUri: { fsPath: '/extension' }, subscriptions } as never,
    { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
  );
}

function createCallbacks() {
  return {
    onMessage: vi.fn(),
    onViewStateChanged: vi.fn(),
    onDisposed: vi.fn(),
  };
}

describe('WebviewPanelHost', () => {
  beforeEach(() => {
    vscodeMock.createWebviewPanel.mockClear();
    vscodeMock.joinPath.mockClear();
  });

  it('creates the panel in the requested column with the requested title', () => {
    const panel = createPanel();
    const host = createHost();
    const callbacks = createCallbacks();

    host.create({ viewColumn: 2 as vscode.ViewColumn, title: 'test-repo', ...callbacks });
    host.postMessage({ type: 'loading', payload: { loading: true } });

    expect(vscodeMock.createWebviewPanel).toHaveBeenCalledWith(
      'speedyGit',
      'test-repo',
      2,
      expect.objectContaining({ enableScripts: true, retainContextWhenHidden: true }),
    );
    expect(panel.webview.html).toContain('<div id="root"></div>');
    expect(callbacks.onViewStateChanged).toHaveBeenCalledWith({ visible: true, active: true });
    expect(panel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading', payload: { loading: true } });
  });

  it('gives two hosts two panels — no single-panel short-circuit', () => {
    createPanel();
    const first = createHost();
    const second = createHost();

    first.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });
    second.create({ viewColumn: 1 as vscode.ViewColumn, title: 'b', ...createCallbacks() });

    expect(vscodeMock.createWebviewPanel).toHaveBeenCalledTimes(2);
  });

  it('create on an already-open host does nothing rather than revealing', () => {
    const panel = createPanel();
    const host = createHost();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });
    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });

    expect(vscodeMock.createWebviewPanel).toHaveBeenCalledTimes(1);
    expect(panel.reveal).not.toHaveBeenCalled();
  });

  it('reveals with an undefined column, so the panel stays in its editor group', () => {
    const panel = createPanel();
    const host = createHost();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });
    host.reveal();
    host.reveal(true);

    expect(panel.reveal).toHaveBeenNthCalledWith(1, undefined, false);
    expect(panel.reveal).toHaveBeenNthCalledWith(2, undefined, true);
  });

  it('setTitle writes the panel title', () => {
    const panel = createPanel();
    const host = createHost();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });
    host.setTitle('sub-mod1');

    expect(panel.title).toBe('sub-mod1');
  });

  it('reports visible and active separately', () => {
    const handles: PanelHandles = {};
    createPanel(handles);
    const host = createHost();
    const callbacks = createCallbacks();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...callbacks });
    handles.viewState?.({ webviewPanel: { visible: true, active: false } });

    expect(callbacks.onViewStateChanged).toHaveBeenLastCalledWith({ visible: true, active: false });
  });

  it('pushes no subscription into context.subscriptions, and disposes them on panel dispose', () => {
    const handles: PanelHandles = {};
    const panel = createPanel(handles);
    const subscriptions: unknown[] = [];
    const host = createHost(subscriptions);
    const callbacks = createCallbacks();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...callbacks });
    expect(subscriptions).toHaveLength(0);

    handles.dispose?.();

    // onDidReceiveMessage, onDidChangeViewState and onDidDispose.
    expect(panel.subscriptionDisposals.count).toBe(3);
    expect(callbacks.onViewStateChanged).toHaveBeenLastCalledWith({ visible: false, active: false });
    expect(callbacks.onDisposed).toHaveBeenCalledTimes(1);
    expect(host.isOpen()).toBe(false);
  });

  it('postMessage after dispose is a no-op', () => {
    const panel = createPanel();
    const host = createHost();

    host.create({ viewColumn: 1 as vscode.ViewColumn, title: 'a', ...createCallbacks() });
    host.dispose();
    host.postMessage({ type: 'loading', payload: { loading: true } });

    expect(panel.webview.postMessage).not.toHaveBeenCalled();
    expect(panel.dispose).toHaveBeenCalledTimes(1);
  });
});
