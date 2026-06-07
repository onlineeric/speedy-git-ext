import { GitError } from '../../shared/errors.js';

/**
 * Detect git's "branch is already checked out / used by worktree at '<path>'"
 * refusal (raised when a target branch is held by another worktree) and rewrite
 * it as a readable message naming the conflicting worktree (FR-024 / T042).
 *
 * Callers supply the remedy text since the appropriate advice differs by
 * operation (checkout vs. worktree add). Returns the original error otherwise.
 */
export function mapWorktreeConflictError(
  error: GitError,
  buildMessage: (conflictingPath: string) => string
): GitError {
  const text = error.stderr ?? error.message;
  const match = text.match(/is already (?:checked out|used by worktree) at '([^']+)'/);
  if (match) {
    return new GitError(buildMessage(match[1]), 'COMMAND_FAILED', error.command, error.stderr);
  }
  return error;
}
