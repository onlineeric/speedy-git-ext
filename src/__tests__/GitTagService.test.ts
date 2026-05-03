import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitTagService } from '../services/GitTagService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitTagService.createTag', () => {
  it('creates a lightweight tag', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.createTag('v1.0', 'abc1234');
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['tag', 'v1.0', 'abc1234'],
    }));
  });

  it('creates an annotated tag with -a -m flags', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.createTag('v1.0', 'abc1234', 'Release notes');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['tag', '-a', '-m', 'Release notes', 'v1.0', 'abc1234'],
    }));
  });

  it('rejects invalid tag names (flag injection)', async () => {
    const service = new GitTagService('/repo', mockLog);
    const result = await service.createTag('-d', 'abc1234');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects invalid commit hashes', async () => {
    const service = new GitTagService('/repo', mockLog);
    const result = await service.createTag('v1.0', 'not-a-hash');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GitTagService.deleteTag', () => {
  it('runs git tag -d', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.deleteTag('v1.0');
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['tag', '-d', 'v1.0'],
    }));
  });

  it('rejects flag-injected tag names', async () => {
    const service = new GitTagService('/repo', mockLog);
    const result = await service.deleteTag('-D');
    expect(result.success).toBe(false);
  });
});

describe('GitTagService.pushTag', () => {
  it('pushes to origin by default', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pushTag('v1.0');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'origin', 'refs/tags/v1.0'],
    }));
  });

  it('pushes to a specified remote', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pushTag('v1.0', 'upstream');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'upstream', 'refs/tags/v1.0'],
    }));
  });

  it('uses an extended timeout for push', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pushTag('v1.0');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ timeout: 60000 }));
  });

  it('passes through underlying errors', async () => {
    const service = new GitTagService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('rejected', 'COMMAND_FAILED'),
    });

    const result = await service.pushTag('v1.0');
    expect(result.success).toBe(false);
  });
});
