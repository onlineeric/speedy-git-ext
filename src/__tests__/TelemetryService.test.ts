import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';

const sendTelemetryEvent = vi.fn();
const sendTelemetryErrorEvent = vi.fn();
const reporterDispose = vi.fn().mockResolvedValue(undefined);
const reporterConstructor = vi.fn();

vi.mock('@vscode/extension-telemetry', () => ({
  TelemetryReporter: class MockTelemetryReporter {
    sendTelemetryEvent = sendTelemetryEvent;
    sendTelemetryErrorEvent = sendTelemetryErrorEvent;
    dispose = reporterDispose;
    constructor(connectionString: string) {
      reporterConstructor(connectionString);
    }
  },
}));

const channelInfo = vi.fn();
const channelDispose = vi.fn();
let configListener: ((event: { affectsConfiguration(section: string): boolean }) => void) | undefined;
let telemetryEnabledListener: (() => void) | undefined;
let extensionSettingValue = true;
let globalTelemetryEnabled = true;

vi.mock('vscode', () => ({
  ExtensionMode: { Production: 1, Development: 2, Test: 3 },
  UIKind: { Desktop: 1, Web: 2 },
  window: {
    createOutputChannel: vi.fn(() => ({ info: channelInfo, dispose: channelDispose })),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, fallback: boolean) => extensionSettingValue ?? fallback),
    })),
    onDidChangeConfiguration: vi.fn((listener: typeof configListener) => {
      configListener = listener;
      return { dispose: vi.fn() };
    }),
  },
  env: {
    appName: 'Visual Studio Code',
    appHost: 'desktop',
    uiKind: 1,
    get isTelemetryEnabled() {
      return globalTelemetryEnabled;
    },
    onDidChangeTelemetryEnabled: vi.fn((listener: typeof telemetryEnabledListener) => {
      telemetryEnabledListener = listener;
      return { dispose: vi.fn() };
    }),
  },
}));

import { createTelemetryService } from '../services/TelemetryService.js';

function productionContext(): vscode.ExtensionContext {
  return { extensionMode: 1 } as unknown as vscode.ExtensionContext;
}

function developmentContext(): vscode.ExtensionContext {
  return { extensionMode: 2 } as unknown as vscode.ExtensionContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  configListener = undefined;
  telemetryEnabledListener = undefined;
  extensionSettingValue = true;
  globalTelemetryEnabled = true;
});

describe('createTelemetryService gating', () => {
  it('returns a no-op when the connection string is empty, but still logs the status line', () => {
    const service = createTelemetryService(productionContext(), '');
    expect(reporterConstructor).not.toHaveBeenCalled();
    expect(channelInfo).toHaveBeenCalledWith('telemetry disabled (reason: no connection string)');

    service.sendPanelOpened('command');
    service.sendOperation('mergeBranch', 'success', 12);
    service.sendError('watcher', 'UNKNOWN');
    expect(sendTelemetryEvent).not.toHaveBeenCalled();
    expect(sendTelemetryErrorEvent).not.toHaveBeenCalled();
  });

  it('returns a no-op outside Production mode even with a connection string', () => {
    const service = createTelemetryService(developmentContext(), 'InstrumentationKey=abc');
    expect(reporterConstructor).not.toHaveBeenCalled();
    expect(channelInfo).toHaveBeenCalledWith('telemetry disabled (reason: dev mode)');
    service.sendPanelOpened('command');
    expect(sendTelemetryEvent).not.toHaveBeenCalled();
  });

  it('constructs the real reporter in Production with a connection string', () => {
    createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    expect(reporterConstructor).toHaveBeenCalledWith('InstrumentationKey=abc');
    expect(channelInfo).toHaveBeenCalledWith('telemetry enabled');
  });
});

describe('real implementation', () => {
  it('appends common.* properties to every event', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.sendPanelOpened('scmButton');
    expect(sendTelemetryEvent).toHaveBeenCalledWith(
      'panelOpened',
      {
        trigger: 'scmButton',
        'common.appName': 'Visual Studio Code',
        'common.appHost': 'desktop',
        'common.uiKind': 'desktop',
      },
      undefined,
    );
  });

  it('sends operation events with duration and error code only on error outcome', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.sendOperation('mergeBranch', 'success', 42.4);
    expect(sendTelemetryEvent).toHaveBeenCalledWith(
      'operation',
      expect.objectContaining({ operation: 'mergeBranch', outcome: 'success' }),
      { durationMs: 42 },
    );
    expect(sendTelemetryEvent.mock.calls[0][1]).not.toHaveProperty('errorCode');

    service.sendOperation('checkoutBranch', 'error', 10, 'COMMAND_FAILED');
    expect(sendTelemetryEvent).toHaveBeenCalledWith(
      'operation',
      expect.objectContaining({ operation: 'checkoutBranch', outcome: 'error', errorCode: 'COMMAND_FAILED' }),
      { durationMs: 10 },
    );
  });

  it('routes trackUi kinds to their event names', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.trackUi({ kind: 'uiInteraction', surface: 'toolbar', action: 'refresh' });
    service.trackUi({ kind: 'dialogOutcome', dialog: 'merge', outcome: 'cancelled' });
    service.trackUi({ kind: 'perf', perfKind: 'topology', durationMs: 7.6, commitCountBucket: '<=500' });

    expect(sendTelemetryEvent).toHaveBeenNthCalledWith(
      1, 'uiInteraction', expect.objectContaining({ surface: 'toolbar', action: 'refresh' }), undefined,
    );
    expect(sendTelemetryEvent).toHaveBeenNthCalledWith(
      2, 'dialogOutcome', expect.objectContaining({ dialog: 'merge', outcome: 'cancelled' }), undefined,
    );
    expect(sendTelemetryEvent).toHaveBeenNthCalledWith(
      3, 'perf', expect.objectContaining({ kind: 'topology', commitCountBucket: '<=500' }), { durationMs: 8 },
    );
  });

  it('sends error events through sendTelemetryErrorEvent', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.sendError('dataLoader', 'TIMEOUT');
    expect(sendTelemetryErrorEvent).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({ area: 'dataLoader', errorCode: 'TIMEOUT' }),
      undefined,
    );
    expect(sendTelemetryEvent).not.toHaveBeenCalled();
  });

  it('fires one-shot events only once per session', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.sendActivate({ activationMs: 100, repoCount: 2 }, true);
    service.sendActivate({ activationMs: 200, repoCount: 3 }, false);
    service.sendSettingsSnapshot(
      {
        dateFormat: 'relative', avatarsEnabled: 'true', showTags: 'true', showRemoteBranches: 'true',
        toolbarShowLabels: 'true', toolbarShowRemoteButton: 'true', statusBarText: 'iconAndText',
      },
      { batchCommitSize: 500, overScan: 50 },
    );
    service.sendSettingsSnapshot(
      {
        dateFormat: 'system', avatarsEnabled: 'false', showTags: 'false', showRemoteBranches: 'false',
        toolbarShowLabels: 'false', toolbarShowRemoteButton: 'false', statusBarText: 'icon',
      },
      { batchCommitSize: 100, overScan: 0 },
    );

    const activateCalls = sendTelemetryEvent.mock.calls.filter(([name]) => name === 'activate');
    const snapshotCalls = sendTelemetryEvent.mock.calls.filter(([name]) => name === 'settingsSnapshot');
    expect(activateCalls).toHaveLength(1);
    expect(activateCalls[0][1]).toEqual(expect.objectContaining({ hasMultiRoot: 'true' }));
    expect(activateCalls[0][2]).toEqual({ activationMs: 100, repoCount: 2 });
    expect(snapshotCalls).toHaveLength(1);
  });

  it('never throws when the reporter throws', () => {
    sendTelemetryEvent.mockImplementation(() => {
      throw new Error('reporter exploded');
    });
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    expect(() => service.sendPanelOpened('command')).not.toThrow();
    expect(() => service.sendOperation('push', 'success', 1)).not.toThrow();
  });

  it('disposes reporter and channel', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    service.dispose();
    expect(reporterDispose).toHaveBeenCalled();
    expect(channelDispose).toHaveBeenCalled();
  });
});

describe('extension setting gate (speedyGit.telemetry.enabled)', () => {
  const settingChangeEvent = {
    affectsConfiguration: (section: string) => section === 'speedyGit.telemetry.enabled',
  };

  it('suppresses sends while the setting is false and logs the status change', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    expect(channelInfo).toHaveBeenCalledWith('telemetry enabled');

    extensionSettingValue = false;
    configListener?.(settingChangeEvent);
    expect(channelInfo).toHaveBeenCalledWith('telemetry disabled (reason: extension setting)');

    service.sendPanelOpened('command');
    service.sendOperation('push', 'success', 1);
    service.sendError('watcher', 'UNKNOWN');
    expect(sendTelemetryEvent).not.toHaveBeenCalled();
    expect(sendTelemetryErrorEvent).not.toHaveBeenCalled();
  });

  it('resumes sends when the setting is re-enabled, without restart', () => {
    const service = createTelemetryService(productionContext(), 'InstrumentationKey=abc');

    extensionSettingValue = false;
    configListener?.(settingChangeEvent);
    service.sendPanelOpened('command');
    expect(sendTelemetryEvent).not.toHaveBeenCalled();

    extensionSettingValue = true;
    configListener?.(settingChangeEvent);
    expect(channelInfo).toHaveBeenCalledWith('telemetry enabled');
    service.sendPanelOpened('command');
    expect(sendTelemetryEvent).toHaveBeenCalledTimes(1);
  });

  it('re-logs the status line when the global telemetry gate changes', () => {
    createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    channelInfo.mockClear();
    globalTelemetryEnabled = false;
    telemetryEnabledListener?.();
    expect(channelInfo).toHaveBeenCalledWith('telemetry disabled (reason: global setting)');
  });

  it('ignores unrelated configuration changes', () => {
    createTelemetryService(productionContext(), 'InstrumentationKey=abc');
    channelInfo.mockClear();
    configListener?.({ affectsConfiguration: () => false });
    expect(channelInfo).not.toHaveBeenCalled();
  });
});
