import { GitError } from '../../../shared/errors.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';

/**
 * How a settings handler reports a write. The new value itself always arrives
 * as the `settingsData` broadcast; these only report whether the write worked.
 *
 * `write` is the write itself (`updateSpeedyGitSetting…`), so the caller still
 * chooses the scope.
 */

/**
 * For a write the Settings dialog waits on: answer `settingSaveResult` with
 * the request's id, so the dialog stays open on a failure instead of a toast.
 */
export async function writeSettingWithReply(
  context: WebviewRequestContext,
  requestId: number,
  description: string,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
    context.postMessage({ type: 'settingSaveResult', payload: { requestId } });
  } catch (error) {
    context.postMessage({ type: 'settingSaveResult', payload: { requestId, error: writeFailureMessage(description, error) } });
  }
}

/** For a fire-and-forget write: a failure is the standard error toast. Resolves whether the write succeeded. */
export async function writeSettingOrToast(
  context: WebviewRequestContext,
  description: string,
  write: () => Promise<void>,
): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    postSettingError(context, writeFailureMessage(description, error));
    return false;
  }
}

function postSettingError(context: WebviewRequestContext, message: string): void {
  context.postMessage({ type: 'error', payload: { error: new GitError(message, 'UNKNOWN') } });
}

function writeFailureMessage(description: string, error: unknown): string {
  return `Could not save ${description}: ${(error as Error).message}`;
}
