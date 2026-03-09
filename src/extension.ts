import * as vscode from 'vscode';
import { ExtensionController } from './ExtensionController.js';

let controller: ExtensionController | undefined;

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel('Speedy Git', { log: true });
  context.subscriptions.push(log);

  log.info('Extension activated');

  controller = new ExtensionController(context, log);

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
