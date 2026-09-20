import * as vscode from 'vscode';
import { ExtensionController } from './ExtensionController.js';
import { GitShowContentProvider } from './GitShowContentProvider.js';
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

  // Registered once, for the window — never per panel. A `git-show:` document
  // names its own repository in the URI, so it keeps resolving correctly after
  // the graph that opened it switched repo or closed.
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      'git-show',
      new GitShowContentProvider((repoPath) => controller!.resolveDiffService(repoPath)),
    ),
  );

  // The optional argument is the status bar item's trigger; the controller
  // re-validates it against the closed catalog.
  const showGraphCommand = vscode.commands.registerCommand('speedyGit.showGraph', (trigger?: unknown) => {
    controller?.showGraph(trigger);
  });

  const openNewGraphTabCommand = vscode.commands.registerCommand('speedyGit.openNewGraphTab', () => {
    controller?.openNewGraphTab('commandPalette');
  });

  const openForRepoCommand = vscode.commands.registerCommand(
    'speedyGit.openForRepo',
    (sourceControl: vscode.SourceControl) => {
      controller?.openForRepo(sourceControl);
    }
  );

  context.subscriptions.push(showGraphCommand, openNewGraphTabCommand, openForRepoCommand);
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
