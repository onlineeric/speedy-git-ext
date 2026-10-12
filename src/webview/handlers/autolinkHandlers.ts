import { GitError } from '../../../shared/errors.js';
import {
  hasCustomAutolinkErrors,
  normalizeCustomAutolinks,
  trimCustomAutolink,
  validateCustomAutolinks,
} from '../../../shared/autolinks.js';
import type { RequestHandlerMap } from '../WebviewMessageRouter.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';
import { updateSpeedyGitSettingInDefinedScope } from './updateSpeedyGitSetting.js';

/**
 * The View settings dialog's Autolinks section.
 *
 * Both write into whichever scope already defines the setting: autolinks are
 * often configured per workspace (a Jira project per codebase), and a Global
 * write shadowed by a workspace value would change nothing the user can see.
 * Like every settings write, the answer is the `settingsData` broadcast that the
 * configuration listener sends, not a reply from here.
 */
export const autolinkHandlers = {
  setCustomAutolinks: async (message, context) => {
    // A webview message is never trusted: the dialog validated this list, but
    // the backend refuses an invalid one rather than writing it.
    const autolinks = normalizeCustomAutolinks(message.payload.autolinks).map(trimCustomAutolink);
    if (validateCustomAutolinks(autolinks).some(hasCustomAutolinkErrors)) {
      postSettingError(context, 'Custom autolinks were not saved: an entry is invalid.');
      return;
    }
    await writeSetting(context, 'autolinks.custom', autolinks, 'custom autolinks');
  },

  setRemoteAutolinksEnabled: async (message, context) => {
    await writeSetting(context, 'autolinks.remoteProvider.enabled', message.payload.enabled === true, 'the GitHub/GitLab autolinks setting');
  },
} satisfies Pick<RequestHandlerMap, 'setCustomAutolinks' | 'setRemoteAutolinksEnabled'>;

async function writeSetting(context: WebviewRequestContext, key: string, value: unknown, description: string): Promise<void> {
  try {
    await updateSpeedyGitSettingInDefinedScope(key, value);
  } catch (error) {
    postSettingError(context, `Could not save ${description}: ${(error as Error).message}`);
  }
}

function postSettingError(context: WebviewRequestContext, message: string): void {
  context.postMessage({ type: 'error', payload: { error: new GitError(message, 'UNKNOWN') } });
}
