import { type Result, ok } from '../../shared/errors.js';
import type { GitExecutor } from '../services/GitExecutor.js';

/**
 * Returns true when the working tree holds anything git would call dirty — staged or
 * unstaged changes **and untracked files**.
 *
 * Untracked files are counted deliberately, because the one operation guarded by this
 * is `git worktree remove`, whose own rule is exactly that: it refuses on "modified or
 * untracked files" and needs `--force` either way. Do not reach for this before rebase,
 * cherry-pick or revert — those tolerate untracked files, and cherry-pick/revert also
 * tolerate unrelated tracked edits, so guarding them here blocks work git would accept.
 * Let git enforce its own preconditions and surface its error, which names the files.
 */
export async function isDirtyWorkingTree(executor: GitExecutor, workspacePath: string): Promise<Result<boolean>> {
  const result = await executor.execute({
    args: ['status', '--porcelain'],
    cwd: workspacePath,
  });
  if (!result.success) return result;
  return ok(result.value.stdout.trim().length > 0);
}
