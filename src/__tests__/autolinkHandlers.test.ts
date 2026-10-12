import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateSetting = vi.fn<(key: string, value: unknown) => Promise<void>>();
vi.mock('../webview/handlers/updateSpeedyGitSetting.js', () => ({
  updateSpeedyGitSettingInDefinedScope: (key: string, value: unknown) => updateSetting(key, value),
}));

import { autolinkHandlers } from '../webview/handlers/autolinkHandlers.js';
import type { WebviewRequestContext } from '../webview/WebviewRequestContext.js';

const JIRA = { prefix: 'ABCD-', url: 'https://jira.example.com/browse/ABCD-<num>' };

function makeContext() {
  const postMessage = vi.fn();
  return { context: { postMessage } as unknown as WebviewRequestContext, postMessage };
}

describe('autolinkHandlers', () => {
  beforeEach(() => {
    updateSetting.mockReset();
    updateSetting.mockResolvedValue(undefined);
  });

  it('writes a valid list, trimmed', async () => {
    const { context, postMessage } = makeContext();
    await autolinkHandlers.setCustomAutolinks(
      { type: 'setCustomAutolinks', payload: { autolinks: [{ prefix: ' ABCD- ', url: JIRA.url }] } },
      context,
    );
    expect(updateSetting).toHaveBeenCalledWith('autolinks.custom', [JIRA]);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('refuses an invalid list and writes nothing', async () => {
    const { context, postMessage } = makeContext();
    await autolinkHandlers.setCustomAutolinks(
      { type: 'setCustomAutolinks', payload: { autolinks: [JIRA, { prefix: 'X-', url: 'command:run?<num>' }] } },
      context,
    );
    expect(updateSetting).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('reports a failed write as an error toast', async () => {
    updateSetting.mockRejectedValue(new Error('read-only settings'));
    const { context, postMessage } = makeContext();
    await autolinkHandlers.setRemoteAutolinksEnabled(
      { type: 'setRemoteAutolinksEnabled', payload: { enabled: false } },
      context,
    );
    expect(updateSetting).toHaveBeenCalledWith('autolinks.remoteProvider.enabled', false);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });
});
