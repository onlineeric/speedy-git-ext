/**
 * Recognise VS Code refusing a settings write for a key it does not know.
 *
 * After an extension updates in place (no window reload), the new version runs
 * but the window's configuration registry can still hold the previous version's
 * `contributes.configuration`. Any setting the new version introduced is then
 * rejected with "... is not a registered configuration" until the window
 * reloads — nothing the extension writes differently can get past it.
 *
 * The error crosses the extension-host RPC as a plain `Error`, so VS Code's
 * `ERROR_UNKNOWN_KEY` code is lost and the message is the only signal.
 */
export function isUnregisteredSettingError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('is not a registered configuration');
}

export const UNREGISTERED_SETTING_MESSAGE =
  'VS Code has not loaded the settings of the updated Speedy Git yet. Reload the window, then try again.';
