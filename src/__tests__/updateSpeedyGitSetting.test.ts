import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  showWarningMessage: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2 },
  workspace: {
    getConfiguration: () => ({ update: mocks.update, inspect: () => undefined }),
  },
  window: { showWarningMessage: mocks.showWarningMessage },
  commands: { executeCommand: mocks.executeCommand },
}));

import { updateSpeedyGitSetting, updateSpeedyGitSettingInDefinedScope } from '../webview/handlers/updateSpeedyGitSetting.js';
import { isUnregisteredSettingError, UNREGISTERED_SETTING_MESSAGE } from '../utils/settingsWriteErrors.js';

const UNREGISTERED = new Error(
  'Unable to write to User Settings because speedyGit.autolinks.custom is not a registered configuration.',
);

/**
 * After an in-place update without a window reload, VS Code refuses to write
 * any setting the new version added. Only a reload fixes it, so the write turns
 * that into an actionable message and offers the reload.
 */
describe('updateSpeedyGitSetting with a setting VS Code has not registered yet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.showWarningMessage.mockResolvedValue(undefined);
  });

  it('recognises only the unregistered-configuration error', () => {
    expect(isUnregisteredSettingError(UNREGISTERED)).toBe(true);
    expect(isUnregisteredSettingError(new Error('Unable to write into user settings. Please open the file.'))).toBe(false);
    expect(isUnregisteredSettingError('is not a registered configuration')).toBe(false);
  });

  it.each([
    ['Global', () => updateSpeedyGitSetting('autolinks.custom', [])],
    ['defined-scope', () => updateSpeedyGitSettingInDefinedScope('autolinks.custom', [])],
  ])('%s write rethrows an actionable message and offers a reload', async (_name, write) => {
    mocks.update.mockRejectedValue(UNREGISTERED);

    await expect(write()).rejects.toThrow(UNREGISTERED_SETTING_MESSAGE);
    expect(mocks.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('Reload the window'), 'Reload Window');
  });

  it('reloads the window when the user accepts', async () => {
    mocks.update.mockRejectedValue(UNREGISTERED);
    mocks.showWarningMessage.mockResolvedValue('Reload Window');

    await expect(updateSpeedyGitSetting('autolinks.custom', [])).rejects.toThrow();
    await vi.waitFor(() => expect(mocks.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow'));
  });

  it('passes any other write error through untouched', async () => {
    const other = new Error('settings file is read-only');
    mocks.update.mockRejectedValue(other);

    await expect(updateSpeedyGitSetting('toolbar.fetch', true)).rejects.toBe(other);
    expect(mocks.showWarningMessage).not.toHaveBeenCalled();
  });
});
