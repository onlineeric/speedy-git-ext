import { describe, expect, it, vi } from 'vitest';
import { RefreshCoordinator } from '../webview/RefreshCoordinator.js';

describe('RefreshCoordinator', () => {
  it('defers auto-refresh while hidden and runs it when visible', async () => {
    const dataLoader = { sendInitialData: vi.fn().mockResolvedValue(undefined) };
    const coordinator = new RefreshCoordinator(
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
      dataLoader as never,
    );

    await coordinator.triggerAutoRefresh();
    expect(dataLoader.sendInitialData).not.toHaveBeenCalled();

    coordinator.setPanelVisible(true);
    await vi.waitFor(() => {
      expect(dataLoader.sendInitialData).toHaveBeenCalledWith(undefined, true);
    });
  });

  it('queues an auto-refresh while another refresh is running', async () => {
    let finishFirstRefresh!: () => void;
    const firstRefresh = new Promise<void>((resolve) => {
      finishFirstRefresh = resolve;
    });
    const dataLoader = {
      sendInitialData: vi.fn()
        .mockReturnValueOnce(firstRefresh)
        .mockResolvedValueOnce(undefined),
    };
    const coordinator = new RefreshCoordinator(
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
      dataLoader as never,
    );
    coordinator.setPanelVisible(true);

    const first = coordinator.triggerAutoRefresh();
    await coordinator.triggerAutoRefresh();
    expect(dataLoader.sendInitialData).toHaveBeenCalledTimes(1);

    finishFirstRefresh();
    await first;

    await vi.waitFor(() => {
      expect(dataLoader.sendInitialData).toHaveBeenCalledTimes(2);
    });
  });
});
