import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSetting = vi.fn<(key: string, value: unknown) => Promise<void>>();
vi.mock('../webview/handlers/updateSpeedyGitSetting.js', () => ({
  updateSpeedyGitSettingInDefinedScope: (key: string, value: unknown) => updateSetting(key, value),
}));

import { gitSettingsHandlers } from '../webview/handlers/gitSettingsHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';

function save(seconds: number | null, requestId = 1) {
  const postMessage = vi.fn();
  const context = { postMessage } as unknown as WebviewRequestContext;
  const done = gitSettingsHandlers.setGitTimeoutSeconds(
    { type: 'setGitTimeoutSeconds', payload: { seconds, requestId } },
    context,
  );
  return { done, postMessage };
}

describe('gitSettingsHandlers.setGitTimeoutSeconds', () => {
  beforeEach(() => {
    updateSetting.mockReset();
    updateSetting.mockResolvedValue(undefined);
  });

  it('writes the value and answers the dialog', async () => {
    const { done, postMessage } = save(300, 4);
    await done;
    expect(updateSetting).toHaveBeenCalledWith('git.timeoutSeconds', 300);
    expect(postMessage).toHaveBeenCalledWith({ type: 'settingSaveResult', payload: { requestId: 4 } });
  });

  it('normalizes again rather than trusting the webview', async () => {
    await save(3).done;
    expect(updateSetting).toHaveBeenCalledWith('git.timeoutSeconds', 15);
  });

  it('keeps 0 as no timeout', async () => {
    await save(0).done;
    expect(updateSetting).toHaveBeenCalledWith('git.timeoutSeconds', 0);
  });

  it('clears the setting for an emptied box, so the default applies', async () => {
    await save(null).done;
    expect(updateSetting).toHaveBeenCalledWith('git.timeoutSeconds', undefined);
  });

  it('answers a failed write to the dialog', async () => {
    updateSetting.mockRejectedValue(new Error('read-only settings'));
    const { done, postMessage } = save(90, 6);
    await done;
    expect(postMessage).toHaveBeenCalledWith({
      type: 'settingSaveResult',
      payload: { requestId: 6, error: 'Could not save the git command timeout: read-only settings' },
    });
  });
});
