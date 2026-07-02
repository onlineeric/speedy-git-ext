import { GitError, type Result, err } from '../../shared/errors.js';
import {
  type GitRefNameValidation,
  validateGitBranchName,
  validateGitRemoteName,
  validateGitTagName,
} from '../../shared/gitRefValidation.js';

const HASH_WITH_PARENT_RE = /^[0-9a-f]{4,40}(~\d+)?$/i;

/** Validates that a string looks like a git commit hash (hex, 4–40 chars, optional ~N suffix). */
export function validateHash(hash: string): Result<string> {
  if (!HASH_WITH_PARENT_RE.test(hash)) {
    return err(new GitError(`Invalid commit hash: ${hash}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: hash };
}

/** Validates a git ref name (branch/remote) — rejects values starting with '-' to prevent flag injection. */
export function validateRefName(name: string): Result<string> {
  if (!name || name.startsWith('-')) {
    return err(new GitError(`Invalid ref name: ${name}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: name };
}

/** Converts a `GitRefNameValidation` result into the `Result<string>` shape used by git services. */
function toRefNameResult(validation: GitRefNameValidation, name: string, label: string): Result<string> {
  if (!validation.valid) {
    return err(new GitError(validation.message ?? `Invalid ${label}: ${name}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: name.trim() };
}

/** Validates a tag name using git refname rules plus flag-injection protection. */
export function validateTagName(name: string): Result<string> {
  return toRefNameResult(validateGitTagName(name), name, 'tag name');
}

/**
 * Validates a name that will be used to create or update a local branch
 * (i.e. anything that ends up writing `refs/heads/<name>`).
 *
 * Applies full git refname rules, including the reserved name "HEAD":
 * `git branch HEAD` is refused by git itself, but lower-level refspecs such as
 * `git fetch origin HEAD:HEAD` bypass that check and silently create a stray
 * `refs/heads/HEAD`, which then makes every subsequent ref lookup ambiguous.
 */
export function validateLocalBranchName(name: string): Result<string> {
  return toRefNameResult(validateGitBranchName(name), name, 'branch name');
}

/** Validates a name that will be used to create a new remote (`git remote add`). */
export function validateRemoteName(name: string): Result<string> {
  return toRefNameResult(validateGitRemoteName(name), name, 'remote name');
}

/** Validates a file path — rejects empty strings and values starting with '-'. */
export function validateFilePath(filePath: string): Result<string> {
  if (!filePath || filePath.startsWith('-')) {
    return err(new GitError(`Invalid file path: ${filePath}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: filePath };
}

/** Validates a worktree target path — rejects empty/whitespace and flag-like values. */
export function validateWorktreePath(worktreePath: string): Result<string> {
  const trimmed = worktreePath?.trim() ?? '';
  if (!trimmed || trimmed.startsWith('-')) {
    return err(new GitError(`Invalid worktree path: ${worktreePath}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: trimmed };
}
