import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import { clampAvatarRefreshDays, DEFAULT_USER_SETTINGS } from '../../../shared/types.js';
import { updateSpeedyGitSetting } from './updateSpeedyGitSetting.js';

export const avatarHandlers = {
  getAvatarAuthState: async (_message, context) => {
    context.sendAvatarAuthState();
  },

  requestGitHubAuth: async (_message, context) => {
    // Granting broadcasts through onStateChanged; a declined or failed prompt
    // changes nothing, so it needs an explicit send to settle the button back
    // to its idle state.
    const result = await context.avatarAuth.requestAuthorization();
    if (result !== 'granted') {
      context.sendAvatarAuthState();
    }
  },

  // removeAuthorization always reports through onStateChanged, which broadcasts
  // the new state — nothing to send here.
  removeGitHubAuth: async (_message, context) => {
    await context.avatarAuth.removeAuthorization();
  },

  setAvatarRefreshDays: async (message) => {
    const days = clampAvatarRefreshDays(message.payload.days, DEFAULT_USER_SETTINGS.avatarRefreshDays);
    await updateSpeedyGitSetting('avatars.refreshDays', days);
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
