import { GitError } from '../../../shared/errors.js';
import {
  hasCustomAutolinkErrors,
  normalizeCustomAutolinks,
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
 * The new value reaches the webview as the `settingsData` broadcast that the
 * configuration listener sends, not as a reply from here.
 */
export const autolinkHandlers = {
  /**
   * Saved from the Settings dialog's footer, which waits for the outcome: the
   * dialog stays open on a failure, so the reply is a `settingSaveResult` rather
   * than an error toast.
   */
  setCustomAutolinks: async (message, context) => {
    const { requestId } = message.payload;
    // A webview message is never trusted: the dialog validated this list, but
    // the backend refuses an invalid one rather than writing it.
    const autolinks = normalizeCustomAutolinks(message.payload.autolinks);
    if (validateCustomAutolinks(autolinks).some(hasCustomAutolinkErrors)) {
      postSaveResult(context, requestId, 'Custom autolinks were not saved: an entry is invalid.');
      return;
    }
    try {
      await updateSpeedyGitSettingInDefinedScope('autolinks.custom', autolinks);
      postSaveResult(context, requestId);
    } catch (error) {
      postSaveResult(context, requestId, `Could not save custom autolinks: ${(error as Error).message}`);
    }
  },

  setRemoteAutolinksEnabled: async (message, context) => {
    try {
      await updateSpeedyGitSettingInDefinedScope('autolinks.remoteProvider.enabled', message.payload.enabled === true);
    } catch (error) {
      const text = `Could not save the GitHub/GitLab autolinks setting: ${(error as Error).message}`;
      context.postMessage({ type: 'error', payload: { error: new GitError(text, 'UNKNOWN') } });
    }
  },
} satisfies Pick<RequestHandlerMap, 'setCustomAutolinks' | 'setRemoteAutolinksEnabled'>;

function postSaveResult(context: WebviewRequestContext, requestId: number, error?: string): void {
  context.postMessage({ type: 'settingSaveResult', payload: error === undefined ? { requestId } : { requestId, error } });
}
