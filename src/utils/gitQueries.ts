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

/**
 * Full hash of the commit HEAD points at. Fails on an unborn branch (fresh repo).
 *
 * Shared rather than re-spelled per service because it is the identity check the
 * amend guard and Go-to-HEAD both rest on: they must resolve HEAD the same way,
 * or the guard clears a commit the navigation then cannot find.
 */
export async function readHeadHash(executor: GitExecutor, workspacePath: string): Promise<Result<string>> {
  const result = await executor.execute({
    args: ['rev-parse', 'HEAD'],
    cwd: workspacePath,
  });
  if (!result.success) return result;
  return ok(result.value.stdout.trim());
}
