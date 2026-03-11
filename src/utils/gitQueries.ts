import { type Result, ok } from '../../shared/errors.js';
import type { GitExecutor } from '../services/GitExecutor.js';

/** Returns true when the working tree has uncommitted changes (staged or unstaged). */
export async function isDirtyWorkingTree(executor: GitExecutor, workspacePath: string): Promise<Result<boolean>> {
  const result = await executor.execute({
    args: ['status', '--porcelain'],
    cwd: workspacePath,
  });
  if (!result.success) return result;
  return ok(result.value.stdout.trim().length > 0);
}
