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

  it('rejects git-invalid tag names before executing git', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute');

    const result = await service.createTag('release candidate', 'abc1234');
    expect(result.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
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

  it('appends --force only when force is set', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pushTag('v1.0', 'origin', true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'origin', '--force', 'refs/tags/v1.0'],
    }));

    spy.mockClear();
    await service.pushTag('v1.0', 'origin', false);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'origin', 'refs/tags/v1.0'],
    }));
  });
});

describe('GitTagService.deleteRemoteTag', () => {
  it('runs git push <remote> --delete <name> with a forced C locale', async () => {
    const service = new GitTagService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.deleteRemoteTag('origin', 'v1.0');
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'origin', '--delete', 'v1.0'],
      env: { LC_ALL: 'C' },
    }));
  });

  it('treats a missing remote tag as a benign no-op (ok)', async () => {
    const service = new GitTagService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError("error: unable to delete 'v1.0': remote ref does not exist", 'COMMAND_FAILED'),
    });

    const result = await service.deleteRemoteTag('origin', 'v1.0');
    expect(result.success).toBe(true);
  });

  it('surfaces a genuine remote failure', async () => {
    const service = new GitTagService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('fatal: Authentication failed', 'COMMAND_FAILED'),
    });

    const result = await service.deleteRemoteTag('origin', 'v1.0');
    expect(result.success).toBe(false);
  });

  it('rejects flag-injected remote/tag names', async () => {
    const service = new GitTagService('/repo', mockLog);
    const result = await service.deleteRemoteTag('origin', '--delete-everything');
    expect(result.success).toBe(false);
  });
});

describe('GitTagService.getTagMetadata', () => {
  it('runs for-each-ref with the null-byte format and parses the output', async () => {
    const service = new GitTagService('/repo', mockLog);
    const stdout = [
      'v1.0\x00tag\x00Release one\nDetails\x00Ada\x001700000000\x00',
      'v0.9\x00commit\x00\x00\x00\x00',
    ].join('\n');
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout, stderr: '' },
    });

    const result = await service.getTagMetadata();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        'for-each-ref',
        '--format=%(refname:short)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggerdate:unix)%00',
        'refs/tags',
      ],
    }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual([
        { name: 'v1.0', annotated: true, message: 'Release one\nDetails', tagger: 'Ada', date: 1700000000 },
        { name: 'v0.9', annotated: false },
      ]);
    }
  });
});
