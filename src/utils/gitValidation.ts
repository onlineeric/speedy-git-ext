import { GitError, type Result, err } from '../../shared/errors.js';

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

const RESERVED_LOCAL_BRANCH_NAMES = new Set(['HEAD']);

/**
 * Validates a name that will be used to create or update a local branch
 * (i.e. anything that ends up writing `refs/heads/<name>`).
 *
 * `git branch <name>` already refuses reserved names like "HEAD", but lower-level
 * refspecs such as `git fetch origin HEAD:HEAD` bypass that check and silently
 * create a stray `refs/heads/HEAD`, which then makes every subsequent ref lookup
 * ambiguous. Guard the call sites that can hit that path.
 */
export function validateLocalBranchName(name: string): Result<string> {
  const base = validateRefName(name);
  if (!base.success) return base;
  if (RESERVED_LOCAL_BRANCH_NAMES.has(name)) {
    return err(new GitError(`'${name}' is reserved and cannot be used as a local branch name.`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: name };
}

/** Validates a file path — rejects empty strings and values starting with '-'. */
export function validateFilePath(filePath: string): Result<string> {
  if (!filePath || filePath.startsWith('-')) {
    return err(new GitError(`Invalid file path: ${filePath}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: filePath };
}
