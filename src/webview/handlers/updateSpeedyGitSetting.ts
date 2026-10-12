import * as vscode from 'vscode';
import { isUnregisteredSettingError, UNREGISTERED_SETTING_MESSAGE } from '../../utils/settingsWriteErrors.js';

/**
 * Write one `speedyGit.*` setting from a webview request.
 *
 * Handlers never answer these directly: the settings-change listener in
 * `ExtensionController` picks the write up and broadcasts fresh `settingsData`
 * to the webview. Centralized so the configuration section name and that
 * fire-and-forget contract are stated once rather than per handler.
 */
export function updateSpeedyGitSetting(key: string, value: unknown): Promise<void> {
  return writeSetting(vscode.workspace.getConfiguration('speedyGit'), key, value, vscode.ConfigurationTarget.Global);
}

/**
 * Write one `speedyGit.*` setting into whichever scope already defines it.
 *
 * A Global write shadowed by an existing Workspace value produces no effective
 * change, so a UI affordance that hides itself once the setting matches would
 * never disappear and the click would look broken. Folder scope is not
 * considered: `speedyGit.worktree.*` is window-scoped, so a folder-level value
 * cannot apply.
 */
export function updateSpeedyGitSettingInDefinedScope(key: string, value: unknown): Promise<void> {
  const config = vscode.workspace.getConfiguration('speedyGit');
  const target = config.inspect(key)?.workspaceValue !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  return writeSetting(config, key, value, target);
}

/**
 * A setting added by a version that was installed without a window reload is
 * refused by VS Code until the reload (see `isUnregisteredSettingError`). The
 * caller's error toast gets a message saying what to do, and a notification
 * offers the reload itself, since the raw "not a registered configuration"
 * reads like a bug in the extension.
 */
async function writeSetting(
  config: vscode.WorkspaceConfiguration,
  key: string,
  value: unknown,
  target: vscode.ConfigurationTarget,
): Promise<void> {
  try {
    await config.update(key, value, target);
  } catch (error) {
    if (!isUnregisteredSettingError(error)) throw error;
    void offerWindowReload();
    throw new Error(UNREGISTERED_SETTING_MESSAGE);
  }
}

async function offerWindowReload(): Promise<void> {
  const reload = 'Reload Window';
  const choice = await vscode.window.showWarningMessage(`Speedy Git: ${UNREGISTERED_SETTING_MESSAGE}`, reload);
  if (choice === reload) {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
