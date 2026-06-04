import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitSubmoduleService } from '../services/GitSubmoduleService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(() => false) };
});

import * as fs from 'fs';

describe('GitSubmoduleService.getSubmodules', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it('fast-paths to empty result when .gitmodules does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const service = new GitSubmoduleService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute');

    const result = await service.getSubmodules();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('reads submodule entries from .gitmodules without running submodule status', async () => {
    // .gitmodules exists, but submodule paths' .git do not (so initialized=false)
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.gitmodules')
    );
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        // path map
        success: true,
        value: { stdout: 'submodule.libname.path vendor/lib\n', stderr: '' },
      })
      .mockResolvedValueOnce({
        // url map
        success: true,
        value: { stdout: 'submodule.libname.url https://x.com/lib.git\n', stderr: '' },
      });

    const result = await service.getSubmodules();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        path: 'vendor/lib',
        hash: '',
        status: 'uninitialized',
        describe: '',
        url: 'https://x.com/lib.git',
        initialized: false,
      });
    }
    expect(service['executor'].execute).toHaveBeenCalledTimes(2);
    expect(service['executor'].execute).not.toHaveBeenCalledWith(expect.objectContaining({
      args: ['submodule', 'status'],
    }));
  });

  it('sorts submodules by path', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.gitmodules'));
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: {
          stdout: [
            'submodule.b.path vendor/b',
            'submodule.a.path vendor/a',
          ].join('\n'),
          stderr: '',
        },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getSubmodules();
    if (result.success) {
      expect(result.value.map((s) => s.path)).toEqual(['vendor/a', 'vendor/b']);
    }
  });

  it('marks submodule as initialized when its inner .git exists', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return pathStr.endsWith('.gitmodules') || pathStr.endsWith('vendor/lib/.git');
    });
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: 'submodule.libname.path vendor/lib\n', stderr: '' },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getSubmodules();
    if (result.success) {
      expect(result.value[0].initialized).toBe(true);
      expect(result.value[0].status).toBe('clean');
    }
  });

  it('skips malformed .gitmodules config lines', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.gitmodules'));
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: 'garbage line\nsubmodule.libname.path vendor/lib\n', stderr: '' },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getSubmodules();
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].path).toBe('vendor/lib');
    }
  });
});

describe('GitSubmoduleService.updateSubmodule / initSubmodule', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('updateSubmodule runs git submodule update --init --', async () => {
    const service = new GitSubmoduleService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.updateSubmodule('vendor/lib');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['submodule', 'update', '--init', '--', 'vendor/lib'],
    }));
  });

  it('initSubmodule uses the same args as update', async () => {
    const service = new GitSubmoduleService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    await service.initSubmodule('vendor/lib');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      args: ['submodule', 'update', '--init', '--', 'vendor/lib'],
    }));
  });
});
