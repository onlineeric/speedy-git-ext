import * as vscode from 'vscode';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';

export const vscodeCommandHandlers = {
  openSettings: async (message) => {
    const query = message.payload.query ?? 'speedyGit';
    await vscode.commands.executeCommand('workbench.action.openSettings', query);
  },

  getSettings: async (_message, context) => {
    const settings = context.getSettings();
    if (settings) {
      context.sendSettingsData(settings);
    }
  },

  setToolbarSetting: async (message) => {
    // The settings-change listener in ExtensionController picks this up and
    // broadcasts fresh settingsData to the webview, so no direct response here.
    const { setting, value } = message.payload;
    await vscode.workspace
      .getConfiguration('speedyGit')
      .update(`toolbar.${setting}`, value, vscode.ConfigurationTarget.Global);
  },

  copyToClipboard: async (message, context) => {
    await vscode.env.clipboard.writeText(message.payload.text);
    context.postMessage({ type: 'success', payload: { message: 'Copied to clipboard' } });
  },

  openExternal: async (message) => {
    await vscode.env.openExternal(vscode.Uri.parse(message.payload.url));
  },

  updatePersistedUIState: async (message, context) => {
    context.uiStateStore.savePersistedUIState(message.payload.uiState);
  },
} satisfies Pick<
  RequestHandlerMap,
  'openSettings' | 'getSettings' | 'setToolbarSetting' | 'copyToClipboard' | 'openExternal' | 'updatePersistedUIState'
>;
