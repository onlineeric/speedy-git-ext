import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitCherryPickService } from '../services/GitCherryPickService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

const defaultOptions = { appendSourceRef: false, noCommit: false };

// Mock fs.existsSync for CHERRY_PICK_HEAD checks
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

import * as fs from 'fs';

describe('GitCherryPickService', () => {
  let service: GitCherryPickService;

  beforeEach(() => {
    service = new GitCherryPickService('/repo', mockLog);
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  describe('isDirtyWorkingTree', () => {
    it('returns false when working tree is clean', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.isDirtyWorkingTree();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe(false);
    });

    it('returns true when working tree is dirty', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: ' M file.txt\n', stderr: '' } });

      const result = await service.isDirtyWorkingTree();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe(true);
    });
  });

  describe('getCherryPickState', () => {
    it('returns idle when CHERRY_PICK_HEAD does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = service.getCherryPickState();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe('idle');
    });

    it('returns in-progress when CHERRY_PICK_HEAD exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const result = service.getCherryPickState();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe('in-progress');
    });
  });

  describe('cherryPick', () => {
    it('rejects an invalid commit hash', async () => {
      const result = await service.cherryPick(['not-a-hash!!'], defaultOptions);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns error when working tree is dirty', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: ' M file.txt\n', stderr: '' } });

      const result = await service.cherryPick(['abc1234'], defaultOptions);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('uncommitted changes');
      }
    });

    it('executes cherry-pick with correct args for basic case', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // isDirtyWorkingTree
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // cherry-pick

      const result = await service.cherryPick(['abc1234'], defaultOptions);
      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['cherry-pick', 'abc1234'] })
      );
    });

    it('adds -x flag when appendSourceRef is true and noCommit is false', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      await service.cherryPick(['abc1234'], { appendSourceRef: true, noCommit: false });
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['cherry-pick', '-x', 'abc1234'] })
      );
    });

    it('omits -x flag when noCommit is true even if appendSourceRef is true', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      await service.cherryPick(['abc1234'], { appendSourceRef: true, noCommit: true });
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['cherry-pick', '--no-commit', 'abc1234'] })
      );
    });

    it('passes -m flag before hash when mainlineParent is set', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      await service.cherryPick(['abc1234'], { appendSourceRef: false, noCommit: false, mainlineParent: 1 });
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['cherry-pick', '-m', '1', 'abc1234'] })
      );
    });

    it('detects conflict via CHERRY_PICK_HEAD file existence', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // isDirtyWorkingTree
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('Git command failed with code 1', 'COMMAND_FAILED', 'git cherry-pick abc1234', 'CONFLICT'),
        });
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const result = await service.cherryPick(['abc1234'], defaultOptions);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('CHERRY_PICK_CONFLICT');
    });

    it('detects empty cherry-pick from stderr', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('failed', 'COMMAND_FAILED', 'git cherry-pick abc1234', 'nothing to commit'),
        });

      const result = await service.cherryPick(['abc1234'], defaultOptions);
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain('empty cherry-pick');
    });

    it('returns success message with count for multiple commits', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.cherryPick(['abc1234', 'def5678'], defaultOptions);
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toContain('2 commits');
    });
  });

  describe('abortCherryPick', () => {
    it('executes git cherry-pick --abort', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.abortCherryPick();
      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ args: ['cherry-pick', '--abort'] })
      );
    });

    it('returns success message on abort', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.abortCherryPick();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toContain('aborted');
    });
  });

  describe('continueCherryPick', () => {
    it('executes git cherry-pick --continue', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({ success: true, value: { stdout: '', stderr: '' } });

      await service.continueCherryPick();
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({ args: expect.arrayContaining(['cherry-pick', '--continue']) })
      );
    });

    it('passes through git error on continue failure', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValue({
          success: false,
          error: new GitError('You must edit all merge conflicts', 'COMMAND_FAILED'),
        });

      const result = await service.continueCherryPick();
      expect(result.success).toBe(false);
    });
  });
});
