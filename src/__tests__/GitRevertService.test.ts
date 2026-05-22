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
      const result = await service.revert('not-a-hash!!', { mode: 'commit' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('returns error when working tree is dirty', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: ' M file.txt\n', stderr: '' } });

      const result = await service.revert('abc1234', { mode: 'commit' });
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

      const result = await service.revert('abc1234', { mode: 'commit', mainlineParent: 2 });

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

      const result = await service.revert('abc1234', { mode: 'commit' });
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

      const result = await service.revert('abc1234', { mode: 'commit' });
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

      const result = await service.revert('abc1234', { mode: 'commit' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REVERT_CONFLICT');
      }
    });

    // T010 [US1]: argv guard for commit mode
    it('mode: commit produces argv ["revert", "--no-edit", <hash>] without -m when no mainline parent', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // dirty
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') }) // REVERT_HEAD
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // revert

      const result = await service.revert('abc1234', { mode: 'commit' });

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['revert', '--no-edit', 'abc1234'] })
      );
    });

    it('mode: commit with mainlineParent=2 produces argv ["revert", "-m", "2", "--no-edit", <hash>]', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.revert('abc1234', { mode: 'commit', mainlineParent: 2 });

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['revert', '-m', '2', '--no-edit', 'abc1234'] })
      );
    });

    // ────────────────── US2 — Stage only mode (no-commit) ──────────────────

    it('T016: mode: no-commit produces ["revert", "--no-commit", <hash>] without -m', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // dirty
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') }) // REVERT_HEAD
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // revert

      const result = await service.revert('abc1234', { mode: 'no-commit' });

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['revert', '--no-commit', 'abc1234'] })
      );
    });

    it('T016b: mode: no-commit with mainlineParent=2 produces ["revert", "-m", "2", "--no-commit", <hash>]', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      const result = await service.revert('abc1234', { mode: 'no-commit', mainlineParent: 2 });

      expect(result.success).toBe(true);
      expect(executeSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ args: ['revert', '-m', '2', '--no-commit', 'abc1234'] })
      );
    });

    it('T017: mode: no-commit + stderr CONFLICT returns REVERT_CONFLICT_NO_RECOVERY (NOT REVERT_CONFLICT)', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }) // dirty
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') }) // REVERT_HEAD
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('CONFLICT (content)', 'COMMAND_FAILED', 'git revert --no-commit abc1234', 'CONFLICT (content): Merge conflict in file.txt'),
        });

      const result = await service.revert('abc1234', { mode: 'no-commit' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REVERT_CONFLICT_NO_RECOVERY');
        expect(result.error.message).toMatch(/Source Control panel/);
        expect(result.error.message).toMatch(/commit (the result )?manually/i);
      }
    });

    it('T018: mode: no-commit + stderr "nothing to commit" returns the existing already-present error', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('nothing to commit, working tree clean', 'COMMAND_FAILED', 'git revert --no-commit abc1234', ''),
        });

      const result = await service.revert('abc1234', { mode: 'no-commit' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('already present');
      }
    });

    it('T019: mode: no-commit still rejects a dirty working tree', async () => {
      vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: ' M file.txt\n', stderr: '' } }); // dirty

      const result = await service.revert('abc1234', { mode: 'no-commit' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('uncommitted changes');
      }
    });

    // ────────────────── US3 — Edit message mode ──────────────────

    it('T023: mode: edit-message runs revert --no-commit then commit -m with the user message', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })  // dirty check
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') }) // REVERT_HEAD
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })  // step 1: revert --no-commit
        .mockResolvedValueOnce({ success: false, error: new GitError('staged', 'COMMAND_FAILED') }) // diff --cached --quiet (non-zero → something staged)
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // step 2: commit -m

      const message = 'Revert PR #42 — broke checkout in WSL';
      const result = await service.revert('abc1234', { mode: 'edit-message', message });

      expect(result.success).toBe(true);
      // Validate ordered calls: revert --no-commit, then diff --cached --quiet, then commit -m
      expect(executeSpy.mock.calls[2][0]).toEqual(
        expect.objectContaining({ args: ['revert', '--no-commit', 'abc1234'] })
      );
      expect(executeSpy.mock.calls[3][0]).toEqual(
        expect.objectContaining({ args: ['diff', '--cached', '--quiet'] })
      );
      expect(executeSpy.mock.calls[4][0]).toEqual(
        expect.objectContaining({ args: ['commit', '--cleanup=verbatim', '-m', message] })
      );
    });

    it('mode: edit-message disables git cleanup and trims only final-line trailing whitespace', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('staged', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } });

      const message = '\nBody line keeps spaces  \nFinal line loses spaces  \t';
      const result = await service.revert('abc1234', { mode: 'edit-message', message });

      expect(result.success).toBe(true);
      expect(executeSpy.mock.calls[4][0]).toEqual(
        expect.objectContaining({
          args: [
            'commit',
            '--cleanup=verbatim',
            '-m',
            '\nBody line keeps spaces  \nFinal line loses spaces',
          ],
        })
      );
    });

    it('T024: mode: edit-message — diff --cached --quiet exits 0 (nothing staged) → "already present", commit step NEVER called', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })  // revert --no-commit OK
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } }); // diff --cached --quiet → exit 0

      const result = await service.revert('abc1234', { mode: 'edit-message', message: 'msg' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('already present');
      }
      // Only 4 invocations: no `git commit` call.
      expect(executeSpy).toHaveBeenCalledTimes(4);
      const calledArgs = executeSpy.mock.calls.map((c) => c[0].args);
      expect(calledArgs.some((a) => a[0] === 'commit')).toBe(false);
    });

    it('T025: mode: edit-message — step-1 CONFLICT → REVERT_CONFLICT_NO_RECOVERY, commit step NEVER called', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('CONFLICT', 'COMMAND_FAILED', 'git revert --no-commit abc1234', 'CONFLICT (content): Merge conflict in file.txt'),
        });

      const result = await service.revert('abc1234', { mode: 'edit-message', message: 'msg' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('REVERT_CONFLICT_NO_RECOVERY');
      }
      // 3 invocations: dirty, REVERT_HEAD check, step 1. No diff, no commit.
      expect(executeSpy).toHaveBeenCalledTimes(3);
      const calledArgs = executeSpy.mock.calls.map((c) => c[0].args);
      expect(calledArgs.some((a) => a[0] === 'commit')).toBe(false);
      expect(calledArgs.some((a) => a[0] === 'diff')).toBe(false);
    });

    it('T026: mode: edit-message — step-2 hook failure → COMMAND_FAILED, NO cleanup, executor called exactly 5 times', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute')
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })
        .mockResolvedValueOnce({ success: false, error: new GitError('not found', 'COMMAND_FAILED') })
        .mockResolvedValueOnce({ success: true, value: { stdout: '', stderr: '' } })  // step 1 OK
        .mockResolvedValueOnce({ success: false, error: new GitError('staged', 'COMMAND_FAILED') }) // diff --cached --quiet non-zero
        .mockResolvedValueOnce({
          success: false,
          error: new GitError('hook rejected', 'COMMAND_FAILED', 'git commit -m ...', 'pre-commit hook failed'),
        });

      const result = await service.revert('abc1234', { mode: 'edit-message', message: 'msg' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('COMMAND_FAILED');
        expect((result.error.stderr ?? '') + result.error.message).toContain('pre-commit hook failed');
      }
      // 5 calls total: dirty, REVERT_HEAD, revert, diff, commit. No follow-up reset/stash.
      expect(executeSpy).toHaveBeenCalledTimes(5);
      const calledArgs = executeSpy.mock.calls.map((c) => c[0].args);
      expect(calledArgs.some((a) => a[0] === 'reset')).toBe(false);
      expect(calledArgs.some((a) => a[0] === 'stash')).toBe(false);
    });

    it('T027: mode: edit-message — empty/whitespace message → VALIDATION_ERROR before any git command', async () => {
      const executeSpy = vi.spyOn(service['executor'], 'execute');

      const result1 = await service.revert('abc1234', { mode: 'edit-message', message: '' });
      expect(result1.success).toBe(false);
      if (!result1.success) {
        expect(result1.error.code).toBe('VALIDATION_ERROR');
      }

      const result2 = await service.revert('abc1234', { mode: 'edit-message', message: '   \n  \t' });
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.code).toBe('VALIDATION_ERROR');
      }

      const result3 = await service.revert('abc1234', { mode: 'edit-message' });
      expect(result3.success).toBe(false);
      if (!result3.success) {
        expect(result3.error.code).toBe('VALIDATION_ERROR');
      }

      // Validation runs before any executor call.
      expect(executeSpy).not.toHaveBeenCalled();
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
