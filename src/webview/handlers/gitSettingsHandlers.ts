import { normalizeGitTimeoutSeconds } from '../../../shared/types.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import { writeSettingWithReply } from './settingWriteReplies.js';
import { updateSpeedyGitSettingInDefinedScope } from './updateSpeedyGitSetting.js';

/**
 * The Settings dialog's Git tab. The new value reaches the webview as the
 * `settingsData` broadcast; the reply only says whether the write worked.
 */
export const gitSettingsHandlers = {
  /**
   * Written into whichever scope already defines it, so a workspace value
   * cannot silently shadow the save. `null` (an emptied box) removes the value,
   * which is what "back to the default" means in VS Code's settings. A webview
   * message is never trusted, so a number is normalized again before writing.
   */
  setGitTimeoutSeconds: async (message, context) => {
    const { seconds, requestId } = message.payload;
    const value = seconds === null ? undefined : normalizeGitTimeoutSeconds(seconds);
    await writeSettingWithReply(context, requestId, 'the git command timeout', () =>
      updateSpeedyGitSettingInDefinedScope('git.timeoutSeconds', value),
    );
  },
} satisfies Pick<RequestHandlerMap, 'setGitTimeoutSeconds'>;
