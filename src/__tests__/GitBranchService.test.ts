import { describe, it, expect, vi } from 'vitest';
import { GitBranchService } from '../services/GitBranchService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;

describe('GitBranchService.deleteBranch', () => {
  it('classifies unmerged branch deletion failures so the UI can request force confirmation', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const { GitError } = await import('../../shared/errors.js');

    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: false,
      error: new GitError(
        'Git command failed with code 1',
        'COMMAND_FAILED',
        'git branch -d dev',
        "error: the branch 'dev' is not fully merged."
      ),
    });

    const result = await service.deleteBranch('dev');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('BRANCH_NOT_FULLY_MERGED');
    }
  });

  it('uses force deletion when explicitly requested', async () => {
    const service = new GitBranchService('/repo', mockLog);
    const executeSpy = vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: '', stderr: '' },
    });

    const result = await service.deleteBranch('dev', true);
    expect(result.success).toBe(true);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ args: ['branch', '-D', 'dev'] })
    );
  });
});
