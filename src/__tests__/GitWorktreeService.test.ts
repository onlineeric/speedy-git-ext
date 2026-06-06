import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitWorktreeService } from '../services/GitWorktreeService.js';
import { GitError, ok } from '../../shared/errors.js';
import type { GitExecOptions, GitExecResult } from '../services/GitExecutor.js';
import type { Result } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

/** Stub `executor.execute`, dispatching on the git subcommand. */
function stubExecutor(
  service: GitWorktreeService,
  handler: (args: string[], opts: GitExecOptions) => Result<GitExecResult>
) {
  return vi
    .spyOn(service['executor'], 'execute')
    .mockImplementation(async (opts) => handler(opts.args, opts));
}

function listOutput(lines: string[]): Result<GitExecResult> {
  return ok({ stdout: lines.join('\n'), stderr: '' });
}

describe('GitWorktreeService.listWorktrees', () => {
  it('parses standard worktree porcelain output and derives isCurrent', async () => {
    const service = new GitWorktreeService('/repo/feature', mockLog);
    stubExecutor(service, () =>
      listOutput([
        'worktree /repo',
        'HEAD aaaa1111',
        'branch refs/heads/main',
        '',
        'worktree /repo/feature',
        'HEAD bbbb2222',
        'branch refs/heads/feature',
      ])
    );

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]).toEqual({
        path: '/repo',
        head: 'aaaa1111',
        branch: 'refs/heads/main',
        isMain: true,
        isDetached: false,
        isCurrent: false,
        isPrunable: false,
      });
      // active cwd is /repo/feature → that linked worktree is "current"
      expect(result.value[1].isMain).toBe(false);
      expect(result.value[1].isCurrent).toBe(true);
    }
  });

  it('normalizes submodule main worktree paths reported as .git/modules gitdirs', async () => {
    const service = new GitWorktreeService('/repo/submodules/repo-b', mockLog);
    stubExecutor(service, (args) => {
      if (args[0] === 'config') {
        expect(args).toEqual(['config', '--path', '--get', 'core.worktree']);
        return ok({ stdout: '../../../../submodules/repo-b\n', stderr: '' });
      }
      if (args[0] === 'for-each-ref') {
        expect(args).toEqual(['for-each-ref', '--format=%(refname)', 'refs/heads', '--points-at', 'HEAD']);
        return ok({ stdout: 'refs/heads/dev\n', stderr: '' });
      }
      return listOutput([
        'worktree /repo/.git/modules/submodules/repo-b',
        'HEAD aaaa1111',
        'detached',
        '',
        'worktree /repo/.git/modules/submodules/repo-b.worktrees/bbbb2222',
        'HEAD bbbb2222',
        'detached',
      ]);
    });

    const result = await service.listWorktrees();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]).toMatchObject({
        path: '/repo/submodules/repo-b',
        branch: 'refs/heads/dev',
        isMain: true,
        isDetached: false,
        isCurrent: true,
      });
      expect(result.value[1]).toMatchObject({
        path: '/repo/.git/modules/submodules/repo-b.worktrees/bbbb2222',
        isMain: false,
        isCurrent: false,
      });
    }
  });

  it('keeps the real submodule main row when listed from a linked worktree window', async () => {
    const service = new GitWorktreeService('/repo/submodules/repo-b.worktrees/feature-api', mockLog);
    stubExecutor(service, (args, opts) => {
      if (args[0] === 'config') {
        expect(opts.cwd).toBe('/repo/submodules/repo-b.worktrees/feature-api');
        return ok({ stdout: '../../../../submodules/repo-b\n', stderr: '' });
      }
      if (args[0] === 'for-each-ref') {
        expect(opts.cwd).toBe('/repo/submodules/repo-b');
        return ok({ stdout: 'refs/heads/dev\n', stderr: '' });
      }
      return listOutput([
        'worktree /repo/.git/modules/submodules/repo-b',
        'HEAD aaaa1111',
        'detached',
        '',
        'worktree /repo/submodules/repo-b.worktrees/feature-api',
        'HEAD bbbb2222',
        'branch refs/heads/feature-api',
      ]);
    });

    const result = await service.listWorktrees();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value[0]).toMatchObject({
        path: '/repo/submodules/repo-b',
        branch: 'refs/heads/dev',
        isMain: true,
        isCurrent: false,
      });
      expect(result.value[1]).toMatchObject({
        path: '/repo/submodules/repo-b.worktrees/feature-api',
        branch: 'refs/heads/feature-api',
        isMain: false,
        isCurrent: true,
      });
    }
  });

  it('marks detached worktrees', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    stubExecutor(service, () => listOutput(['worktree /repo', 'HEAD aaaa1111', 'detached']));

    const result = await service.listWorktrees();
    if (result.success) {
      expect(result.value[0].isDetached).toBe(true);
      expect(result.value[0].branch).toBe('');
    }
  });

  it('flags prunable worktrees from the porcelain annotation', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    stubExecutor(service, () =>
      listOutput([
        'worktree /repo',
        'HEAD aaaa1111',
        'branch refs/heads/main',
        '',
        'worktree /repo/gone',
        'HEAD bbbb2222',
        'branch refs/heads/gone',
        'prunable gitdir file points to non-existent location',
      ])
    );

    const result = await service.listWorktrees();
    if (result.success) {
      expect(result.value[0].isPrunable).toBe(false);
      expect(result.value[1].isPrunable).toBe(true);
    }
  });

  it('returns empty array on empty output', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    stubExecutor(service, () => ok({ stdout: '', stderr: '' }));

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });

  it('returns empty array (success) when git worktree list fails', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError('cmd not found', 'COMMAND_FAILED'),
    });

    const result = await service.listWorktrees();
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual([]);
  });
});

describe('GitWorktreeService.addWorktree', () => {
  function captureArgs(service: GitWorktreeService): { args: string[] } {
    const captured = { args: [] as string[] };
    stubExecutor(service, (args) => {
      captured.args = args;
      return ok({ stdout: '', stderr: '' });
    });
    return captured;
  }

  it('builds the existing-branch command form', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured = captureArgs(service);
    const result = await service.addWorktree({ path: '/wt/feature', ref: 'feature', branchMode: 'existing' });
    expect(result.success).toBe(true);
    expect(captured.args).toEqual(['worktree', 'add', '/wt/feature', 'feature']);
  });

  it('builds the new-branch command form with -b', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured = captureArgs(service);
    await service.addWorktree({ path: '/wt/x', ref: 'origin/x', branchMode: 'new', newBranchName: 'x' });
    expect(captured.args).toEqual(['worktree', 'add', '-b', 'x', '/wt/x', 'origin/x']);
  });

  it('builds the detached command form with --detach', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured = captureArgs(service);
    await service.addWorktree({ path: '/wt/d', ref: 'aaaa1111', branchMode: 'detached' });
    expect(captured.args).toEqual(['worktree', 'add', '--detach', '/wt/d', 'aaaa1111']);
  });

  it('inserts --force right after add', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured = captureArgs(service);
    await service.addWorktree({ path: '/wt/f', ref: 'feature', branchMode: 'existing', force: true });
    expect(captured.args).toEqual(['worktree', 'add', '--force', '/wt/f', 'feature']);
  });

  it('rejects an empty new-branch name', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    captureArgs(service);
    const result = await service.addWorktree({ path: '/wt/x', ref: 'main', branchMode: 'new', newBranchName: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('maps "already checked out" stderr to a readable message naming the worktree', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    stubExecutor(service, () => ({
      success: false,
      error: new GitError(
        "fatal: 'feature' is already checked out at '/repo/feature'",
        'COMMAND_FAILED',
        'git worktree add',
        "fatal: 'feature' is already checked out at '/repo/feature'"
      ),
    }));
    const result = await service.addWorktree({ path: '/wt/x', ref: 'feature', branchMode: 'existing' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('/repo/feature');
      expect(result.error.message).toContain('already checked out');
    }
  });
});

describe('GitWorktreeService.removeWorktree', () => {
  it('removes a clean worktree without --force', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured: string[][] = [];
    stubExecutor(service, (args) => {
      captured.push(args);
      if (args[0] === 'status') return ok({ stdout: '', stderr: '' }); // clean
      return ok({ stdout: '', stderr: '' });
    });
    const result = await service.removeWorktree('/wt/feature');
    expect(result.success).toBe(true);
    expect(captured).toContainEqual(['worktree', 'remove', '/wt/feature']);
  });

  it('refuses a dirty worktree without force, with a readable message', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    stubExecutor(service, (args) => {
      if (args[0] === 'status') return ok({ stdout: ' M file.txt', stderr: '' }); // dirty
      return ok({ stdout: '', stderr: '' });
    });
    const result = await service.removeWorktree('/wt/feature');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('uncommitted changes');
  });

  it('removes with --force and skips the dirty pre-check', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured: string[][] = [];
    stubExecutor(service, (args) => {
      captured.push(args);
      return ok({ stdout: '', stderr: '' });
    });
    const result = await service.removeWorktree('/wt/feature', { force: true });
    expect(result.success).toBe(true);
    expect(captured).toContainEqual(['worktree', 'remove', '--force', '/wt/feature']);
    expect(captured.some((a) => a[0] === 'status')).toBe(false);
  });
});

describe('GitWorktreeService.pruneWorktrees', () => {
  it('runs git worktree prune', async () => {
    const service = new GitWorktreeService('/repo', mockLog);
    const captured: string[][] = [];
    stubExecutor(service, (args) => {
      captured.push(args);
      return ok({ stdout: '', stderr: '' });
    });
    const result = await service.pruneWorktrees();
    expect(result.success).toBe(true);
    expect(captured).toContainEqual(['worktree', 'prune']);
  });
});

describe('GitWorktreeService.resolveWorktreePath', () => {
  function withMainWorktree(service: GitWorktreeService, mainPath: string, extraPaths: string[] = []) {
    stubExecutor(service, (args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        const lines = [`worktree ${mainPath}`, 'HEAD aaaa1111', 'branch refs/heads/main'];
        for (const p of extraPaths) {
          lines.push('', `worktree ${p}`, 'HEAD bbbb2222', `branch refs/heads/${p.split('/').pop()}`);
        }
        return listOutput(lines);
      }
      return ok({ stdout: '', stderr: '' });
    });
  }

  it('anchors ../${repoName}.worktrees to the MAIN worktree, sanitizes the leaf', async () => {
    // Active cwd is a linked worktree, but the path must anchor to the main repo.
    const service = new GitWorktreeService('/home/user/repo.worktrees/old', mockLog);
    withMainWorktree(service, '/home/user/repo');

    const result = await service.resolveWorktreePath(
      { ref: 'feature/login', branchMode: 'existing' },
      '../${repoName}.worktrees'
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.path).toBe('/home/user/repo.worktrees/feature-login');
      expect(result.value.leafName).toBe('feature-login');
    }
  });

  it('uses the new branch name as the leaf in new-branch mode', async () => {
    const service = new GitWorktreeService('/home/user/repo', mockLog);
    withMainWorktree(service, '/home/user/repo');
    const result = await service.resolveWorktreePath(
      { ref: 'abc1234', branchMode: 'new', newBranchName: 'hotfix' },
      '../${repoName}.worktrees'
    );
    if (result.success) expect(result.value.leafName).toBe('hotfix');
  });

  it('uses a 10-character short commit hash as the leaf in detached mode', async () => {
    const service = new GitWorktreeService('/home/user/repo', mockLog);
    stubExecutor(service, (args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        return listOutput(['worktree /home/user/repo', 'HEAD aaaa1111', 'branch refs/heads/main']);
      }
      if (args[0] === 'rev-parse') {
        expect(args).toEqual(['rev-parse', '--short=10', '--verify', '19eae44a9d6c2b1a^{commit}']);
        return ok({ stdout: '19eae44a9d\n', stderr: '' });
      }
      return ok({ stdout: '', stderr: '' });
    });

    const result = await service.resolveWorktreePath(
      { ref: '19eae44a9d6c2b1a', branchMode: 'detached' },
      '../${repoName}.worktrees'
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.leafName).toBe('19eae44a9d');
      expect(result.value.path).toBe('/home/user/repo.worktrees/19eae44a9d');
    }
  });

  it('appends a numeric suffix when the target collides with an existing worktree', async () => {
    const service = new GitWorktreeService('/home/user/repo', mockLog);
    withMainWorktree(service, '/home/user/repo', ['/home/user/repo.worktrees/feature']);
    const result = await service.resolveWorktreePath(
      { ref: 'feature', branchMode: 'existing' },
      '../${repoName}.worktrees'
    );
    if (result.success) {
      expect(result.value.leafName).toBe('feature-2');
      expect(result.value.path).toBe('/home/user/repo.worktrees/feature-2');
    }
  });

  it('appends a numeric suffix to detached short-hash leaves when the target collides', async () => {
    const service = new GitWorktreeService('/home/user/repo', mockLog);
    stubExecutor(service, (args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        return listOutput([
          'worktree /home/user/repo',
          'HEAD aaaa1111',
          'branch refs/heads/main',
          '',
          'worktree /home/user/repo.worktrees/19eae44a9d',
          'HEAD 19eae44a9d6c2b1a',
          'detached',
        ]);
      }
      if (args[0] === 'rev-parse') {
        return ok({ stdout: '19eae44a9d\n', stderr: '' });
      }
      return ok({ stdout: '', stderr: '' });
    });

    const result = await service.resolveWorktreePath(
      { ref: 'HEAD', branchMode: 'detached' },
      '../${repoName}.worktrees'
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.leafName).toBe('19eae44a9d-2');
      expect(result.value.path).toBe('/home/user/repo.worktrees/19eae44a9d-2');
    }
  });

  it('anchors default paths to a submodule worktree when git reports the main path as a gitdir', async () => {
    const service = new GitWorktreeService('/repo/submodules/repo-b', mockLog);
    stubExecutor(service, (args) => {
      if (args[0] === 'worktree' && args[1] === 'list') {
        return listOutput([
          'worktree /repo/.git/modules/submodules/repo-b',
          'HEAD aaaa1111',
          'detached',
        ]);
      }
      if (args[0] === 'config') {
        return ok({ stdout: '../../../../submodules/repo-b\n', stderr: '' });
      }
      if (args[0] === 'for-each-ref') {
        return ok({ stdout: 'refs/heads/dev\n', stderr: '' });
      }
      return ok({ stdout: '', stderr: '' });
    });

    const result = await service.resolveWorktreePath(
      { ref: 'feature/submodule', branchMode: 'existing' },
      '../${repoName}.worktrees'
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.path).toBe('/repo/submodules/repo-b.worktrees/feature-submodule');
      expect(result.value.leafName).toBe('feature-submodule');
    }
  });
});
