import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitRemoteService } from '../services/GitRemoteService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

describe('GitRemoteService.push', () => {
  it('builds basic push args', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.push('origin', 'main');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', 'origin', 'main'],
      timeout: 60000,
    }));
  });

  it('adds -u when setUpstream is true', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.push('origin', 'main', true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', '-u', 'origin', 'main'],
    }));
  });

  it('adds --force-with-lease for safe force', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.push('origin', 'feat', false, 'force-with-lease');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', '--force-with-lease', 'origin', 'feat'],
    }));
  });

  it('adds --force for hard force', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.push('origin', 'feat', false, 'force');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['push', '--force', 'origin', 'feat'],
    }));
  });

  it('rejects invalid remote name (flag injection)', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const result = await service.push('--evil', 'main');
    expect(result.success).toBe(false);
  });

  it('rejects invalid branch name', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const result = await service.push('origin', '-x');
    expect(result.success).toBe(false);
  });
});

describe('GitRemoteService.pull', () => {
  it('uses bare git pull when no remote/branch given', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pull();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: ['pull'] }));
  });

  it('adds --rebase when requested', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pull(undefined, undefined, true);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ args: ['pull', '--rebase'] }));
  });

  it('defaults to origin when only branch is given', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pull(undefined, 'main');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['pull', 'origin', 'main'],
    }));
  });

  it('passes both remote and branch when both are given', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.pull('upstream', 'main');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['pull', 'upstream', 'main'],
    }));
  });
});

describe('GitRemoteService.getRemotes', () => {
  it('parses fetch and push URLs into RemoteInfo entries', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: [
          'origin\thttps://github.com/me/repo.git (fetch)',
          'origin\thttps://github.com/me/repo.git (push)',
          'upstream\thttps://github.com/them/repo.git (fetch)',
          'upstream\tgit@github.com:them/repo.git (push)',
        ].join('\n'),
        stderr: '',
      },
    });

    const result = await service.getRemotes();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        name: 'origin',
        fetchUrl: 'https://github.com/me/repo.git',
        pushUrl: 'https://github.com/me/repo.git',
      });
      expect(result.value[1]).toEqual({
        name: 'upstream',
        fetchUrl: 'https://github.com/them/repo.git',
        pushUrl: 'git@github.com:them/repo.git',
      });
    }
  });

  it('returns empty array when no remotes configured', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.getRemotes();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });

  it('skips lines that do not match expected format', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: 'this-is-not-a-remote\norigin\thttps://example.com/r.git (fetch)\n',
        stderr: '',
      },
    });

    const result = await service.getRemotes();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toHaveLength(1);
  });
});

describe('GitRemoteService.addRemote / removeRemote / editRemote', () => {
  it('addRemote runs git remote add', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.addRemote('origin', 'https://example.com/repo.git');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['remote', 'add', 'origin', 'https://example.com/repo.git'],
    }));
  });

  it('removeRemote runs git remote remove', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.removeRemote('origin');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['remote', 'remove', 'origin'],
    }));
  });

  it('editRemote runs git remote set-url', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.editRemote('origin', 'git@example.com:r.git');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['remote', 'set-url', 'origin', 'git@example.com:r.git'],
    }));
  });

  it('addRemote rejects flag-injected names', async () => {
    const service = new GitRemoteService('/repo', mockLog);
    const result = await service.addRemote('--upload-pack=evil', 'https://x.com/r.git');
    expect(result.success).toBe(false);
  });
});
