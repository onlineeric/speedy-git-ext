import * as vscode from 'vscode';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import {
  MAX_AVATAR_REFRESH_DAYS,
  MIN_AVATAR_REFRESH_DAYS,
  clampAvatarRefreshDays,
} from '../../services/avatarCachePolicy.js';
import { DEFAULT_USER_SETTINGS } from '../../../shared/types.js';

export const avatarHandlers = {
  getAvatarAuthState: async (_message, context) => {
    context.sendAvatarAuthState();
  },

  requestGitHubAuth: async (_message, context) => {
    await context.avatarAuth.requestAuthorization();
    // requestAuthorization broadcasts on success; send unconditionally so a
    // declined prompt still settles the button back to its idle state.
    context.sendAvatarAuthState();
  },

  removeGitHubAuth: async (_message, context) => {
    await context.avatarAuth.removeAuthorization();
    context.sendAvatarAuthState();
  },

  setAvatarRefreshDays: async (message) => {
    const days = clampAvatarRefreshDays(message.payload.days, DEFAULT_USER_SETTINGS.avatarRefreshDays);
    // The settings-change listener in ExtensionController picks this up and
    // broadcasts fresh settingsData, so there is no direct response here.
    await vscode.workspace
      .getConfiguration('speedyGit')
      .update('avatars.refreshDays', days, vscode.ConfigurationTarget.Global);
  },
  clearAvatarCache: async (_message, context) => {
    await context.clearAvatarCache();
    context.postMessage({ type: 'avatarCacheCleared', payload: {} });
    // Reload so hydration re-runs against the current commits and the queue
    // starts refilling immediately — otherwise the graph would sit blank until
    // the next refresh.
    await context.refreshCoordinator.reload();
  },
} satisfies Pick<
  RequestHandlerMap,
  'getAvatarAuthState' | 'requestGitHubAuth' | 'removeGitHubAuth' | 'setAvatarRefreshDays' | 'clearAvatarCache'
>;

export { MAX_AVATAR_REFRESH_DAYS, MIN_AVATAR_REFRESH_DAYS };
