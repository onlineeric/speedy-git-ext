import * as vscode from 'vscode';
import { TelemetryReporter } from '@vscode/extension-telemetry';
import type { GitErrorCode } from '../../shared/errors.js';
import {
  MAX_TELEMETRY_DURATION_MS,
  type CommitCountBucket,
  type ErrorArea,
  type TelemetryEventName,
  type TrackedOperation,
  type UiTelemetryEvent,
} from '../../shared/telemetry.js';

/** Closed property set for the once-per-session `settingsSnapshot` event. */
export interface SettingsSnapshotProperties {
  dateFormat: 'relative' | 'absolute' | 'absolute-date' | 'system' | 'custom';
  avatarsEnabled: 'true' | 'false';
  showTags: 'true' | 'false';
  showRemoteBranches: 'true' | 'false';
  toolbarShowLabels: 'true' | 'false';
  toolbarShowRemoteButton: 'true' | 'false';
  statusBarText: 'icon' | 'iconAndText';
  signatureColumnVisible?: 'true' | 'false';
}

/**
 * The single telemetry funnel (049-usage-telemetry). Every method is
 * fire-and-forget: returns `void`, never throws, never blocks the caller
 * (FR-007/FR-016). Call sites never null-check — dev/test builds receive a
 * structural no-op (FR-015).
 */
export interface TelemetryService extends vscode.Disposable {
  /** Once per session; no-ops on repeat calls. */
  sendActivate(measurements: { activationMs: number; repoCount: number }, hasMultiRoot: boolean): void;
  /** Once per session; no-ops on repeat calls. */
  sendSettingsSnapshot(
    snapshot: SettingsSnapshotProperties,
    measurements: { batchCommitSize: number; overScan: number },
  ): void;
  sendPanelOpened(trigger: 'command' | 'scmButton'): void;
  /** Called only by the router middleware. */
  sendOperation(operation: TrackedOperation, outcome: 'success' | 'error', durationMs: number, errorCode?: GitErrorCode): void;
  /** Called only by telemetryHandlers after catalog validation. */
  trackUi(event: UiTelemetryEvent): void;
  sendPerfInitialLoad(durationMs: number, commitCountBucket: CommitCountBucket): void;
  /** `sendTelemetryErrorEvent` path; untracked-path failures only (FR-014). */
  sendError(area: ErrorArea, errorCode: GitErrorCode): void;
  dispose(): void;
}

const OUTPUT_CHANNEL_NAME = 'Speedy Git Telemetry';
const EXTENSION_SETTING_SECTION = 'speedyGit.telemetry.enabled';

type TelemetryProperties = Record<string, string>;
type TelemetryMeasurements = Record<string, number>;

/**
 * Build the telemetry funnel. Returns the inert no-op implementation when the
 * build has no connection string or the session is not a production install
 * (F5/dev-host/test), so maintainer activity never pollutes the data (FR-015).
 */
export function createTelemetryService(
  context: vscode.ExtensionContext,
  connectionString: string,
): TelemetryService {
  if (connectionString === '') {
    return new NoOpTelemetryService('no connection string');
  }
  if (context.extensionMode !== vscode.ExtensionMode.Production) {
    return new NoOpTelemetryService('dev mode');
  }
  return new ReporterTelemetryService(connectionString);
}

/** Lazily create the transparency channel and emit the one construction status line (FR-008a). */
function createStatusChannel(statusLine: string): vscode.LogOutputChannel {
  const channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME, { log: true });
  channel.info(statusLine);
  return channel;
}

class NoOpTelemetryService implements TelemetryService {
  private readonly channel: vscode.LogOutputChannel;

  constructor(reason: 'no connection string' | 'dev mode') {
    this.channel = createStatusChannel(`telemetry disabled (reason: ${reason})`);
  }

  sendActivate(): void {}
  sendSettingsSnapshot(): void {}
  sendPanelOpened(): void {}
  sendOperation(): void {}
  trackUi(): void {}
  sendPerfInitialLoad(): void {}
  sendError(): void {}

  dispose(): void {
    this.channel.dispose();
  }
}

class ReporterTelemetryService implements TelemetryService {
  private readonly channel: vscode.LogOutputChannel;
  private readonly reporter: TelemetryReporter;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly commonProperties: TelemetryProperties;
  private extensionSettingEnabled: boolean;
  private activateSent = false;
  private settingsSnapshotSent = false;

  constructor(connectionString: string) {
    this.extensionSettingEnabled = readExtensionSetting();
    this.reporter = new TelemetryReporter(connectionString);
    this.commonProperties = {
      'common.appName': vscode.env.appName,
      'common.appHost': vscode.env.appHost,
      'common.uiKind': vscode.env.uiKind === vscode.UIKind.Web ? 'web' : 'desktop',
    };
    this.channel = createStatusChannel(this.describeGateStatus());

    // Re-log the status line whenever either consent gate changes (FR-008a).
    // The global level is enforced inside the reporter; we only mirror it here.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration(EXTENSION_SETTING_SECTION)) return;
        this.extensionSettingEnabled = readExtensionSetting();
        this.channel.info(this.describeGateStatus());
      }),
      vscode.env.onDidChangeTelemetryEnabled(() => {
        this.channel.info(this.describeGateStatus());
      }),
    );
  }

  sendActivate(measurements: { activationMs: number; repoCount: number }, hasMultiRoot: boolean): void {
    if (this.activateSent) return;
    this.activateSent = true;
    this.send('activate', { hasMultiRoot: String(hasMultiRoot) }, {
      activationMs: clampDuration(measurements.activationMs),
      repoCount: measurements.repoCount,
    });
  }

  sendSettingsSnapshot(
    snapshot: SettingsSnapshotProperties,
    measurements: { batchCommitSize: number; overScan: number },
  ): void {
    if (this.settingsSnapshotSent) return;
    this.settingsSnapshotSent = true;
    this.send('settingsSnapshot', { ...snapshot }, { ...measurements });
  }

  sendPanelOpened(trigger: 'command' | 'scmButton'): void {
    this.send('panelOpened', { trigger });
  }

  sendOperation(
    operation: TrackedOperation,
    outcome: 'success' | 'error',
    durationMs: number,
    errorCode?: GitErrorCode,
  ): void {
    const properties: TelemetryProperties = { operation, outcome };
    if (outcome === 'error') {
      properties.errorCode = errorCode ?? 'UNKNOWN';
    }
    this.send('operation', properties, { durationMs: clampDuration(durationMs) });
  }

  trackUi(event: UiTelemetryEvent): void {
    switch (event.kind) {
      case 'uiInteraction':
        this.send('uiInteraction', { surface: event.surface, action: event.action });
        break;
      case 'dialogOutcome':
        this.send('dialogOutcome', { dialog: event.dialog, outcome: event.outcome });
        break;
      case 'perf':
        this.send('perf', { kind: event.perfKind, commitCountBucket: event.commitCountBucket }, {
          durationMs: clampDuration(event.durationMs),
        });
        break;
    }
  }

  sendPerfInitialLoad(durationMs: number, commitCountBucket: CommitCountBucket): void {
    this.send('perf', { kind: 'initialLoad', commitCountBucket }, { durationMs: clampDuration(durationMs) });
  }

  sendError(area: ErrorArea, errorCode: GitErrorCode): void {
    this.send('error', { area, errorCode }, undefined, true);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    // Reporter disposal flushes pending events (FR-017); fire-and-forget.
    void this.reporter.dispose();
    this.channel.dispose();
  }

  /**
   * The one place events leave the process. Skips when the extension setting
   * gate is off (the global level is enforced inside the reporter), and
   * swallows every failure — telemetry must never affect any user operation.
   */
  private send(
    name: TelemetryEventName,
    properties: TelemetryProperties,
    measurements?: TelemetryMeasurements,
    isErrorEvent = false,
  ): void {
    try {
      if (!this.extensionSettingEnabled) return;
      const enriched = { ...properties, ...this.commonProperties };
      if (isErrorEvent) {
        this.reporter.sendTelemetryErrorEvent(name, enriched, measurements);
      } else {
        this.reporter.sendTelemetryEvent(name, enriched, measurements);
      }
      this.channel.info(`event ${name} ${JSON.stringify({ ...properties, ...(measurements ?? {}) })}`);
    } catch {
      // FR-016: telemetry failures are swallowed silently.
    }
  }

  private describeGateStatus(): string {
    if (!this.extensionSettingEnabled) return 'telemetry disabled (reason: extension setting)';
    if (!vscode.env.isTelemetryEnabled) return 'telemetry disabled (reason: global setting)';
    return 'telemetry enabled';
  }
}

function readExtensionSetting(): boolean {
  try {
    return vscode.workspace.getConfiguration('speedyGit').get<boolean>('telemetry.enabled', true);
  } catch {
    return true;
  }
}

function clampDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 0;
  return Math.round(Math.min(durationMs, MAX_TELEMETRY_DURATION_MS));
}
