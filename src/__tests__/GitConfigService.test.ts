import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitConfigService } from '../services/GitConfigService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitConfigService', () => {
  describe('getConfig', () => {
    it('returns trimmed value on success', async () => {
      const service = new GitConfigService('/repo', mockLog);
      vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: 'Eric Cheng\n', stderr: '' },
      });

      const result = await service.getConfig('user.name');
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe('Eric Cheng');
    });

    it('omits scope flag when not specified', async () => {
      const service = new GitConfigService('/repo', mockLog);
      const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      await service.getConfig('user.email');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        args: ['config', '--get', 'user.email'],
      }));
    });

    it('passes --local scope when requested', async () => {
      const service = new GitConfigService('/repo', mockLog);
      const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      await service.getConfig('user.email', 'local');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        args: ['config', '--local', '--get', 'user.email'],
      }));
    });

    it('passes --global scope when requested', async () => {
      const service = new GitConfigService('/repo', mockLog);
      const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      await service.getConfig('core.editor', 'global');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        args: ['config', '--global', '--get', 'core.editor'],
      }));
    });

    it('passes through underlying errors', async () => {
      const service = new GitConfigService('/repo', mockLog);
      vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: false,
        error: new GitError('not found', 'COMMAND_FAILED'),
      });

      const result = await service.getConfig('missing.key');
      expect(result.success).toBe(false);
    });
  });

  describe('setConfig', () => {
    it('builds args without scope', async () => {
      const service = new GitConfigService('/repo', mockLog);
      const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      const result = await service.setConfig('user.name', 'Alice');
      expect(result.success).toBe(true);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        args: ['config', 'user.name', 'Alice'],
      }));
    });

    it('returns descriptive success message', async () => {
      const service = new GitConfigService('/repo', mockLog);
      vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      const result = await service.setConfig('user.name', 'Alice', 'global');
      if (result.success) expect(result.value).toBe('Set user.name = Alice');
    });
  });

  describe('unsetConfig', () => {
    it('passes --unset flag', async () => {
      const service = new GitConfigService('/repo', mockLog);
      const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: '', stderr: '' },
      });

      await service.unsetConfig('user.name', 'local');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        args: ['config', '--local', '--unset', 'user.name'],
      }));
    });
  });

  describe('getGitVersion', () => {
    it('strips "git version " prefix from output', async () => {
      const service = new GitConfigService('/repo', mockLog);
      vi.spyOn(service['executor'], 'execute').mockResolvedValue({
        success: true,
        value: { stdout: 'git version 2.43.0\n', stderr: '' },
      });

      const result = await service.getGitVersion();
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toBe('2.43.0');
    });
  });
});
