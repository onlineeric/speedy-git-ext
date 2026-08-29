import * as vscode from 'vscode';

/**
 * Write one `speedyGit.*` setting from a webview request.
 *
 * Handlers never answer these directly: the settings-change listener in
 * `ExtensionController` picks the write up and broadcasts fresh `settingsData`
 * to the webview. Centralized so the configuration section name and that
 * fire-and-forget contract are stated once rather than per handler.
 */
export function updateSpeedyGitSetting(key: string, value: unknown): Thenable<void> {
  return vscode.workspace.getConfiguration('speedyGit').update(key, value, vscode.ConfigurationTarget.Global);
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
export async function updateSpeedyGitSettingInDefinedScope(key: string, value: unknown): Promise<void> {
  const config = vscode.workspace.getConfiguration('speedyGit');
  const target = config.inspect(key)?.workspaceValue !== undefined
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  await config.update(key, value, target);
}
