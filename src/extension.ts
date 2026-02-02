import * as vscode from 'vscode';
import { ExtensionController } from './ExtensionController.js';

let controller: ExtensionController | undefined;

export function activate(context: vscode.ExtensionContext) {
  controller = new ExtensionController(context);

  const showGraphCommand = vscode.commands.registerCommand('speedyGit.showGraph', () => {
    controller?.showGraph();
  });

  context.subscriptions.push(showGraphCommand);
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
