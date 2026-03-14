import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitError } from '../../shared/errors.js';
import { GitRevertService } from '../services/GitRevertService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitRevertService', () => {
  let service: GitRevertService;

  beforeEach(() => {
    service = new GitRevertService('/repo', mockLog);
  });

  describe('revert', () => {
    it('rejects an invalid commit hash', async () => {
      const result = await service.revert('not-a-hash!!');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns error when working tree is dirty', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: ' M file.txt\n', stderr: '' } });

      const result = await service.revert('abc1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('uncommitted changes');
      }
    });

    it('executes revert with the mainline parent when provided', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        // dirty check
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        // rev-parse --verify REVERT_HEAD (not in progress)
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        // revert command
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.revert('abc1234', 2);

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['revert', '-m', '2', '--no-edit', 'abc1234'] })
      );
    });

    it('returns revert-in-progress when another revert is already active', async () => {
      vi.spyOn(service['executor'], 'execute')
        // dirty check
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        // rev-parse --verify REVERT_HEAD (in progress)
        .mockResolvedValueOnce({ success: true, value: { stdout: 'abc123\n', stderr: '' } });

      const result = await service.revert('abc1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REVERT_IN_PROGRESS');
      }
    });

    it('detects empty revert output even when git provided no stderr', async () => {
      vi.spyOn(service['executor'], 'execute')
        // dirty check
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        // rev-parse --verify REVERT_HEAD (not in progress)
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        // revert command fails with "nothing to commit"
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('nothing to commit, working tree clean', 'COMMAND_FAILED', 'git revert --no-edit abc1234', ''),
        });

      const result = await service.revert('abc1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('already present');
      }
    });

    it('detects conflict when REVERT_HEAD appears after failed revert', async () => {
      vi.spyOn(service['executor'], 'execute')
        // dirty check
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        // rev-parse --verify REVERT_HEAD (not in progress before revert)
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        // revert command fails with conflict
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('CONFLICT', 'COMMAND_FAILED', 'git revert --no-edit abc1234', 'CONFLICT'),
        })
        // rev-parse --verify REVERT_HEAD (now in progress after conflict)
        .mockResolvedValueOnce({ success: true, value: { stdout: 'abc123\n', stderr: '' } });

      const result = await service.revert('abc1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REVERT_CONFLICT');
      }
    });
  });

  describe('getRevertState', () => {
    it('returns in-progress when REVERT_HEAD exists', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: 'abc123\n', stderr: '' } });

      const result = await service.getRevertState();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('in-progress');
      }
    });

    it('returns idle when REVERT_HEAD does not exist', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') });

      const result = await service.getRevertState();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('idle');
      }
    });
  });

  describe('continueRevert', () => {
    it('executes git revert --continue', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      await service.continueRevert();

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ args: ['revert', '--continue'] })
      );
    });
  });

  describe('abortRevert', () => {
    it('executes git revert --abort', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      await service.abortRevert();

      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ args: ['revert', '--abort'] })
      );
    });
  });
});
