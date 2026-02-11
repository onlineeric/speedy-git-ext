import { GitError, type Result, err } from '../../shared/errors.js';

const HEX_HASH_RE = /^[0-9a-f]{4,40}$/i;
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

/** Validates a file path — rejects empty strings and values starting with '-'. */
export function validateFilePath(filePath: string): Result<string> {
  if (!filePath || filePath.startsWith('-')) {
    return err(new GitError(`Invalid file path: ${filePath}`, 'VALIDATION_ERROR'));
  }
  return { success: true, value: filePath };
}
