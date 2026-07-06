import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionController } from '../ExtensionController.js';
import { createTelemetryStub } from './telemetryTestStub.js';

type ConfigChangeListener = (event: { affectsConfiguration: (key: string) => boolean }) => void;
type StatusBarItemStub = {
  text: string;
  tooltip: string;
  command: string;
  show: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

const { configValues, getConfigChangeListener, setConfigChangeListener, getStatusBarItem, setStatusBarItem } = vi.hoisted(() => {
  const state: {
    configValues: Record<string, unknown>;
    configChangeListener: ConfigChangeListener | undefined;
    statusBarItem: StatusBarItemStub | undefined;
  } = {
    configValues: {},
    configChangeListener: undefined,
    statusBarItem: undefined,
  };
  return {
    configValues: state.configValues,
    getConfigChangeListener: () => state.configChangeListener,
    setConfigChangeListener: (listener: ConfigChangeListener | undefined) => { state.configChangeListener = listener; },
    getStatusBarItem: () => state.statusBarItem,
    setStatusBarItem: (item: StatusBarItemStub | undefined) => { state.statusBarItem = item; },
  };
});

vi.mock('vscode', () => {
  return {
    StatusBarAlignment: { Left: 1, Right: 2 },
    window: {
      createStatusBarItem: vi.fn(() => {
        const item: StatusBarItemStub = {
          text: '',
          tooltip: '',
          command: '',
          show: vi.fn(),
          hide: vi.fn(),
          dispose: vi.fn(),
        };
        setStatusBarItem(item);
        return item;
      }),
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration: vi.fn(() => ({
        get: vi.fn((key: string, defaultValue?: unknown) => {
          return key in configValues ? configValues[key] : defaultValue;
        }),
      })),
      onDidChangeConfiguration: vi.fn((listener: ConfigChangeListener) => {
        setConfigChangeListener(listener);
        return { dispose: vi.fn() };
      }),
    },
    extensions: {
      getExtension: vi.fn(() => undefined),
    },
    EventEmitter: class {
      private listeners: Array<(value: unknown) => void> = [];
      event = (listener: (value: unknown) => void) => {
        this.listeners.push(listener);
        return { dispose: vi.fn() };
      };
      fire(value: unknown) {
        this.listeners.forEach((l) => l(value));
      }
      dispose() {
        this.listeners = [];
      }
    },
    Uri: { joinPath: vi.fn(), from: vi.fn(), parse: vi.fn(), file: vi.fn() },
  };
});

function createController() {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as unknown as LogOutputChannel;

  const context = {
    subscriptions: [] as Array<{ dispose: () => void }>,
    globalState: { get: vi.fn(), update: vi.fn(() => Promise.resolve()) },
    extensionUri: {},
  } as unknown as ConstructorParameters<typeof ExtensionController>[0];

  return new ExtensionController(context, log, createTelemetryStub(), 0);
}

function fireConfigChange(changedKey: string) {
  const listener = getConfigChangeListener();
  if (!listener) throw new Error('config change listener not registered');
  listener({
    affectsConfiguration: (key: string) => key === changedKey,
  });
}

describe('ExtensionController status bar text', () => {
  beforeEach(() => {
    for (const key of Object.keys(configValues)) delete configValues[key];
    setConfigChangeListener(undefined);
    setStatusBarItem(undefined);
  });

  it('defaults to icon + text when statusBarText config is unset', () => {
    createController();
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');
  });

  it('renders icon only when statusBarText is set to "icon"', () => {
    configValues.statusBarText = 'icon';
    createController();
    expect(getStatusBarItem()?.text).toBe('$(zap)');
  });

  it('renders icon + text when statusBarText is set to "iconAndText"', () => {
    configValues.statusBarText = 'iconAndText';
    createController();
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');
  });

  it('falls back to icon + text for unrecognized values', () => {
    // Anything that is not exactly 'icon' uses the iconAndText label.
    configValues.statusBarText = 'unexpected-mode';
    createController();
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');
  });

  it('updates the status bar text live when the statusBarText setting changes', () => {
    configValues.statusBarText = 'iconAndText';
    createController();
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');

    configValues.statusBarText = 'icon';
    fireConfigChange('speedyGit.statusBarText');
    expect(getStatusBarItem()?.text).toBe('$(zap)');

    configValues.statusBarText = 'iconAndText';
    fireConfigChange('speedyGit.statusBarText');
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');
  });

  it('does not touch status bar text for unrelated setting changes', () => {
    configValues.statusBarText = 'iconAndText';
    createController();

    // Simulate the user toggling a webview-only setting. The status bar text
    // should remain unchanged even if the config value happened to differ.
    configValues.statusBarText = 'icon';
    fireConfigChange('speedyGit.graphColors');
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');

    fireConfigChange('speedyGit.overScan');
    expect(getStatusBarItem()?.text).toBe('$(zap) Speedy Git');
  });
});
