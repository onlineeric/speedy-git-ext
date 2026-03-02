import { describe, it, expect, vi } from 'vitest';
import { GitHistoryService } from '../services/GitHistoryService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

describe('GitHistoryService.reset', () => {
  it('executes git reset with correct args for mixed mode', async () => {
    const service = new GitHistoryService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.reset('abc1234', 'mixed');
    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['reset', '--mixed', 'abc1234'] })
    );
  });

  it('returns success message with short hash and mode', async () => {
    const service = new GitHistoryService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.reset('abc1234def567890', 'soft');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('Reset to abc1234 (soft)');
    }
  });

  it('rejects an invalid hash', async () => {
    const service = new GitHistoryService('/repo', mockLog);
    const result = await service.reset('not-a-hash!!', 'soft');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('passes through git command failure', async () => {
    const service = new GitHistoryService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');
    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValue({
        success: false,
        error: new GitError('Git command failed with code 128', 'COMMAND_FAILED', 'git reset --hard abc1234'),
      });

    const result = await service.reset('abc1234', 'hard');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('COMMAND_FAILED');
    }
  });
});
