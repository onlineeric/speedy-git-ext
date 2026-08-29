import { lstat, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { isInsideBaseDir } from '../services/worktreeLeafName.js';

/**
 * Delete directories that a worktree removal has just emptied.
 *
 * Nested worktree folders leave their parents behind: removing `<base>/exp/branch1`
 * deletes only `branch1`, and `<base>/exp/` would stay forever. Both functions here
 * follow the same rules:
 *
 * - **`rmdir` is the emptiness test.** Never `readdir`-then-delete, which races and
 *   would cheerfully delete a directory that gained a file in between. `ENOTEMPTY`
 *   is the answer, so a stray `.DS_Store` stops the walk — the intended "strictly
 *   empty" behaviour.
 * - **Symlinks are never followed or deleted.** `rmdir` refuses one anyway; the
 *   explicit `lstat` keeps the sweep from descending through one.
 * - **`baseDir` itself is never deleted**, and nothing above it is ever touched.
 * - **A worktree's own contents are never touched.** The sweep stops at any directory
 *   holding a `.git` entry, so it only ever removes the scaffolding folders between
 *   `baseDir` and a worktree.
 * - **Failures are swallowed.** These are housekeeping; a caller's `Result` never
 *   changes because a folder could not be removed. Each failure is logged once.
 */

export interface EmptyDirCleanupLog {
  warn(message: string): void;
}

/** True when `dir` is a real directory (not a symlink, not a file, not missing). */
async function isRealDirectory(dir: string): Promise<boolean> {
  try {
    const stats = await lstat(dir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Try to remove one directory. Returns true when it was removed, false when it was
 * not empty, is not a real directory, or could not be removed for any other reason.
 */
async function tryRemoveEmptyDir(dir: string, log: EmptyDirCleanupLog): Promise<boolean> {
  if (!(await isRealDirectory(dir))) return false;
  try {
    await rmdir(dir);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // A non-empty directory is the expected stopping condition, not a problem.
    if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'ENOENT') {
      log.warn(`Could not remove empty worktree folder: ${(error as Error).message}`);
    }
    return false;
  }
}

/**
 * Delete each now-empty parent of `startDir`, walking upward and stopping before
 * `baseDir`. Does nothing when `startDir` is not inside `baseDir` — a worktree the
 * user placed somewhere custom is left entirely alone.
 */
export async function pruneEmptyParents(
  startDir: string,
  baseDir: string,
  log: EmptyDirCleanupLog,
): Promise<void> {
  if (!isInsideBaseDir(baseDir, startDir)) return;

  let current = path.dirname(path.resolve(startDir));
  while (isInsideBaseDir(baseDir, current)) {
    const removed = await tryRemoveEmptyDir(current, log);
    if (!removed) return;
    current = path.dirname(current);
  }
}

/**
 * Delete every empty directory under `baseDir`, bottom-up, so parents orphaned by a
 * worktree folder deleted outside VS Code are cleaned up too. Never deletes `baseDir`
 * itself, and is a no-op when it does not exist.
 */
export async function sweepEmptyDirs(baseDir: string, log: EmptyDirCleanupLog): Promise<void> {
  const base = path.resolve(baseDir);
  if (!(await isRealDirectory(base))) return;
  await sweepChildren(base, log);
}

/** Recurse into real subdirectories first, then try to remove each one. */
async function sweepChildren(dir: string, log: EmptyDirCleanupLog): Promise<void> {
  let entries: string[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    // A `.git` entry (a file in a linked worktree, a directory in the main one) marks
    // a checkout root. Descending past it would walk the user's whole working tree —
    // `node_modules` and all — and would delete their genuinely-empty folders, which
    // git does not track and so cannot restore. The sweep only owns the scaffolding
    // *between* the base dir and a worktree, never anything inside one.
    if (dirents.some((entry) => entry.name === '.git')) return;
    // `isDirectory()` is false for a symlink, so this filter is also the symlink guard.
    entries = dirents.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    log.warn(`Could not scan worktree base folder for empty directories: ${(error as Error).message}`);
    return;
  }

  for (const name of entries) {
    const child = path.join(dir, name);
    await sweepChildren(child, log);
    await tryRemoveEmptyDir(child, log);
  }
}
