import * as vscode from 'vscode';
import { ExtensionController } from './ExtensionController.js';
import { createTelemetryService } from './services/TelemetryService.js';

let controller: ExtensionController | undefined;

export function activate(context: vscode.ExtensionContext) {
  const activationStart = performance.now();
  const log = vscode.window.createOutputChannel('Speedy Git', { log: true });
  context.subscriptions.push(log);

  log.info('Extension activated');

  // Connection string is baked in by esbuild `define` on production builds
  // only; dev/test builds see '' and get the structural no-op (FR-015).
  const telemetry = createTelemetryService(
    context,
    process.env.SPEEDYGIT_TELEMETRY_CONNECTION_STRING ?? '',
  );
  context.subscriptions.push(telemetry);

  controller = new ExtensionController(context, log, telemetry, activationStart);

  const showGraphCommand = vscode.commands.registerCommand('speedyGit.showGraph', () => {
    controller?.showGraph();
  });

  const openForRepoCommand = vscode.commands.registerCommand(
    'speedyGit.openForRepo',
    (sourceControl: vscode.SourceControl) => {
      controller?.openForRepo(sourceControl);
    }
  );

  context.subscriptions.push(showGraphCommand, openForRepoCommand);
  context.subscriptions.push({
    dispose: () => {
      controller?.dispose();
      controller = undefined;
    },
  });
}

export function deactivate() {
  controller?.dispose();
  controller = undefined;
}
