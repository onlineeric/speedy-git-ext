import * as vscode from 'vscode';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import { updateSpeedyGitSetting } from './updateSpeedyGitSetting.js';

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
    const { setting, value } = message.payload;
    await updateSpeedyGitSetting(`toolbar.${setting}`, value);
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

  // Recorded on close rather than on send, so a reload before the user read it
  // shows the dialog again.
  dismissWhatsNew: async (_message, context) => {
    await context.markWhatsNewShown();
  },
} satisfies Pick<
  RequestHandlerMap,
  'openSettings' | 'getSettings' | 'setToolbarSetting' | 'copyToClipboard' | 'openExternal' | 'updatePersistedUIState' | 'dismissWhatsNew'
>;
