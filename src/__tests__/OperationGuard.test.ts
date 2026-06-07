import { describe, expect, it, vi } from 'vitest';
import { OperationGuard } from '../webview/OperationGuard.js';
import { GitServiceRegistry } from '../webview/GitServiceRegistry.js';

function createGuard(overrides: Record<string, unknown> = {}) {
  const services = new GitServiceRegistry({
    gitRebaseService: {
      getRebaseState: vi.fn(() => ({ success: true, value: { state: 'idle' } })),
      ...(overrides.gitRebaseService as object),
    },
    gitCherryPickService: {
      getCherryPickState: vi.fn(() => ({ success: true, value: 'idle' })),
      ...(overrides.gitCherryPickService as object),
    },
    gitRevertService: {
      getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'idle' }),
      ...(overrides.gitRevertService as object),
    },
    gitLogService: {
      verifyRef: vi.fn().mockResolvedValue({ success: true, value: false }),
      ...(overrides.gitLogService as object),
    },
  } as never);

  return new OperationGuard(services);
}

describe('OperationGuard', () => {
  it('returns null when no operation is in progress', async () => {
    await expect(createGuard().getOperationInProgressError()).resolves.toBeNull();
  });

  it('reports rebase before lower-priority operations', async () => {
    const error = await createGuard({
      gitRebaseService: {
        getRebaseState: vi.fn(() => ({ success: true, value: { state: 'in-progress' } })),
      },
      gitCherryPickService: {
        getCherryPickState: vi.fn(() => ({ success: true, value: 'in-progress' })),
      },
    }).getOperationInProgressError();

    expect(error?.code).toBe('OPERATION_IN_PROGRESS');
    expect(error?.message).toContain('rebase');
  });

  it('reports cherry-pick, revert, and merge operation states', async () => {
    await expect(createGuard({
      gitCherryPickService: {
        getCherryPickState: vi.fn(() => ({ success: true, value: 'in-progress' })),
      },
    }).getOperationInProgressError()).resolves.toMatchObject({ message: expect.stringContaining('cherry-pick') });

    await expect(createGuard({
      gitRevertService: {
        getRevertState: vi.fn().mockResolvedValue({ success: true, value: 'in-progress' }),
      },
    }).getOperationInProgressError()).resolves.toMatchObject({ message: expect.stringContaining('revert') });

    await expect(createGuard({
      gitLogService: {
        verifyRef: vi.fn().mockResolvedValue({ success: true, value: true }),
      },
    }).getOperationInProgressError()).resolves.toMatchObject({ message: expect.stringContaining('merge') });
  });
});
