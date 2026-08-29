import path from 'node:path';

/**
 * Turn a git ref into the folder name(s) a worktree is created under, plus the path
 * comparisons that answer "is this still inside the base dir".
 *
 * Extracted from `GitWorktreeService` because admitting `/` into a folder name
 * turns what used to be a one-line regex into a containment-safety rule: once a
 * segment can be a separator, "sanitize the ref" and "keep the result inside the
 * base directory" are two different questions and both need testing on their own.
 */

/**
 * Sanitize one path segment with the historical allowlist. Never returns a separator,
 * because it runs per segment — anything outside `[A-Za-z0-9._-]` collapses to `-`.
 */
export function sanitizeWorktreeSegment(segment: string): string {
  return segment
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
}

/**
 * Split a ref into sanitized, filesystem-safe segments.
 *
 * Splits on `/` *and* `\` so a Windows-style separator cannot survive as a literal
 * character inside a segment, and drops `.` / `..` components outright rather than
 * sanitizing them into `-`. Git ref names already forbid `..`, a leading or trailing
 * `/`, and `//`, so that is defence in depth against a hand-typed new-branch name
 * reaching the resolver before validation gates the Create button.
 *
 * Returns `['worktree']` when nothing survives, matching the historical fallback.
 */
export function buildWorktreeSegments(ref: string): string[] {
  const segments = ref
    .split(/[/\\]+/)
    .filter((segment) => segment !== '.' && segment !== '..')
    .map(sanitizeWorktreeSegment)
    // Sanitizing strips leading/trailing dots, so `.`/`..` cannot survive it — the
    // pre-filter above is the one that matters, and it drops the component outright
    // rather than collapsing it to `-`.
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : ['worktree'];
}

/**
 * Normalize a path for comparison — resolved, and case-insensitive on Windows.
 *
 * The one spelling of "are these two paths the same place", shared by the containment
 * check below and `GitWorktreeService`'s collision check, so the two can never
 * disagree about a pair of paths.
 */
export function normalizePathForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * True when `candidate` resolves to a path strictly inside `baseDir`.
 *
 * The trailing separator matters: without it `<base>-other` would read as being
 * inside `<base>` because it shares its prefix.
 */
export function isInsideBaseDir(baseDir: string, candidate: string): boolean {
  const base = normalizePathForCompare(baseDir);
  const target = normalizePathForCompare(candidate);
  if (target === base) return false;
  return target.startsWith(base.endsWith(path.sep) ? base : base + path.sep);
}
