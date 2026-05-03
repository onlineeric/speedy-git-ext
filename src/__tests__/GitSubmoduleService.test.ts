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

  it('parses clean submodule lines', async () => {
    // .gitmodules exists, but submodule paths' .git do not (so initialized=false)
    vi.mocked(fs.existsSync).mockImplementation((p) =>
      String(p).endsWith('.gitmodules')
    );
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        // submodule status
        success: true,
        value: { stdout: ' aaa111 vendor/lib (v1.0)\n', stderr: '' },
      })
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
        hash: 'aaa111',
        status: 'clean',
        describe: 'v1.0',
        url: 'https://x.com/lib.git',
        initialized: false,
      });
    }
  });

  it('classifies prefixes - = uninitialized, + = dirty, U = dirty (conflict)', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.gitmodules'));
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: {
          stdout: [
            '-aaa111 mod-uninit',
            '+bbb222 mod-dirty (v2)',
            'Uccc333 mod-conflict',
          ].join('\n'),
          stderr: '',
        },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getSubmodules();
    if (result.success) {
      expect(result.value.find((s) => s.path === 'mod-uninit')!.status).toBe('uninitialized');
      expect(result.value.find((s) => s.path === 'mod-dirty')!.status).toBe('dirty');
      expect(result.value.find((s) => s.path === 'mod-conflict')!.status).toBe('dirty');
    }
  });

  it('marks submodule as initialized when its inner .git exists and status != uninitialized', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pathStr = String(p);
      return pathStr.endsWith('.gitmodules') || pathStr.endsWith('vendor/lib/.git');
    });
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: ' aaa111 vendor/lib\n', stderr: '' },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

    const result = await service.getSubmodules();
    if (result.success) {
      expect(result.value[0].initialized).toBe(true);
    }
  });

  it('skips lines that do not match the expected pattern', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => String(p).endsWith('.gitmodules'));
    const service = new GitSubmoduleService('/repo', mockLog);

    vi.spyOn(service['executor'], 'execute')
      .mockResolvedValueOnce({
        success: true,
        value: { stdout: 'garbage line\n aaa111 vendor/lib\n', stderr: '' },
      })
      .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
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
