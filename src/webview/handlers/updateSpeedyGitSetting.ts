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
