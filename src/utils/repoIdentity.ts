import * as path from 'path';

/**
 * The path flavour for the running platform, read at call time.
 *
 * In production this is exactly what the bare `path` module already is; going
 * through `process.platform` is what lets a test drive the Windows rules from a
 * Linux runner, which is the only way the drive-letter case rule is coverable.
 */
function platformPath(): path.PlatformPath {
  return process.platform === 'win32' ? path.win32 : path.posix;
}

/**
 * One answer to "are these two paths the same working tree, the same object
 * store, or a submodule of one another".
 *
 * Every refresh-routing and peer-busy decision in the multi-tab feature is
 * phrased in terms of these three directories, because a repository path alone
 * cannot tell them apart: a linked worktree and its main repo share refs but
 * not a checkout, and a submodule lives inside its parent's tree while keeping
 * a separate object store.
 *
 * Symlinked repo paths are deliberately NOT resolved with `fs.realpath`. Git
 * answers with the path it was given, and `GitRepoDiscoveryService` already
 * documents that it does not merge symlink aliases; resolving here would make
 * two tabs opened on the two spellings route differently from how VS Code
 * lists them.
 */
export interface RepoIdentity {
  /** The path the tab was opened on — the key callers hold. */
  repoPath: string;
  /** `git rev-parse --absolute-git-dir` — per working tree. Identifies THE WORKING TREE. */
  gitDir: string;
  /** `git rev-parse --git-common-dir`, absolutised. Shared by a repo and its linked worktrees. */
  commonGitDir: string;
  /** `git rev-parse --show-toplevel`. Empty for a bare repository. */
  topLevel: string;
}

/**
 * `path.resolve` plus a trailing-separator strip, and on Windows the drive
 * letter lowercased — the drive letter ONLY. Lowercasing the whole path would
 * merge distinct repos on Linux, where paths are case-sensitive.
 */
export function normalizeRepoPath(p: string): string {
  if (!p) return '';
  const platform = platformPath();
  let resolved = platform.resolve(p);
  if (resolved.length > 1 && resolved.endsWith(platform.sep)) {
    resolved = resolved.slice(0, -1);
  }
  if (process.platform === 'win32' && /^[a-zA-Z]:/.test(resolved)) {
    resolved = resolved[0].toLowerCase() + resolved.slice(1);
  }
  return resolved;
}

/**
 * Path equality with normalisation and the platform's case rule applied once,
 * here, so every predicate below agrees about it.
 *
 * Both operands are normalised because most callers do not hold a normalised
 * string: a `RepoIdentity`'s fields are, but the paths compared against them
 * come raw from `sourceControl.rootUri.fsPath` and from workspace folders. A
 * trailing separator or a non-canonical spelling on one side would otherwise
 * read as a different repository, which is a duplicate graph tab rather than a
 * revealed one.
 */
export function pathsEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const left = normalizeRepoPath(a);
  const right = normalizeRepoPath(b);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

/** Same checkout: HEAD, the index and in-progress operation state are shared. */
export function isSameWorkingTree(a: RepoIdentity, b: RepoIdentity): boolean {
  return pathsEqual(a.gitDir, b.gitDir);
}

/**
 * Same object store: refs, tags and fetched objects are shared. True for a repo
 * and each of its linked worktrees. This is the refresh-routing key.
 */
export function sharesObjectStore(a: RepoIdentity, b: RepoIdentity): boolean {
  return pathsEqual(a.commonGitDir, b.commonGitDir);
}

/**
 * Normalised containment. `false` when the two are equal, and `false` for a
 * sibling whose name merely starts with the parent's (`/a/repo2` is not inside
 * `/a/repo`).
 */
export function isPathInside(parent: string, child: string): boolean {
  if (!parent || !child) return false;
  const normalizedParent = normalizeRepoPath(parent);
  const normalizedChild = normalizeRepoPath(child);
  if (pathsEqual(normalizedParent, normalizedChild)) return false;

  const platform = platformPath();
  const relative = platform.relative(normalizedParent, normalizedChild);
  if (!relative) return false;
  if (platform.isAbsolute(relative)) return false;
  return !relative.split(/[\\/]/).includes('..');
}

/**
 * Deliberately a *path* test, not a `.gitmodules` read: a nested repo that is
 * not a registered submodule still changes the parent's `git status`, which is
 * exactly what the parent tab renders.
 */
export function isSubmoduleOf(parent: RepoIdentity, child: RepoIdentity): boolean {
  return isPathInside(parent.topLevel, child.topLevel);
}
