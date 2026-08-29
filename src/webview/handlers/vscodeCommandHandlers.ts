import * as vscode from 'vscode';
import { GitError } from '../../../shared/errors.js';
import { normalizeWorktreeFolderNameStyle } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import { updateSpeedyGitSetting, updateSpeedyGitSettingInDefinedScope } from './updateSpeedyGitSetting.js';

/** How each worktree folder style is named in the UI, so the toast matches the dialog. */
const WORKTREE_STYLE_LABELS = { nested: 'Nested path', flat: 'Flatten path' } as const;

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

  /**
   * Save the Create Worktree dialog's folder-style choice as the default.
   *
   * The payload is re-normalized here: a webview message is never trusted to carry
   * a valid enum. A rejected write (read-only settings file, no workspace open for
   * a Workspace target) surfaces as the standard error toast, and the dialog's link
   * stays visible — which is accurate, since nothing was saved.
   */
  setWorktreeFolderNameStyle: async (message, context) => {
    const style = normalizeWorktreeFolderNameStyle(message.payload.style);
    try {
      await updateSpeedyGitSettingInDefinedScope('worktree.folderNameStyle', style);
      context.postMessage({
        type: 'success',
        payload: { message: `${WORKTREE_STYLE_LABELS[style]} saved as the default worktree folder style` },
      });
    } catch (error) {
      context.postMessage({
        type: 'error',
        payload: {
          error: new GitError(
            `Could not save the default worktree folder style: ${(error as Error).message}`,
            'UNKNOWN',
          ),
        },
      });
    }
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
  'openSettings' | 'getSettings' | 'setToolbarSetting' | 'setWorktreeFolderNameStyle' | 'copyToClipboard' | 'openExternal' | 'updatePersistedUIState' | 'dismissWhatsNew'
>;
