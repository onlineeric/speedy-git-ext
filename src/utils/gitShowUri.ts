/**
 * The `git-show:` URI contract, in one place, so the builder and the content
 * provider cannot drift.
 *
 * Component meanings:
 * - `authority` — the revision: a commit hash, or one of the two sentinels.
 * - `query` — the file path inside the repository.
 * - `path` — a human-readable label; it is what the editor tab shows and is
 *   never parsed back.
 * - `fragment` — **the repository the revision belongs to** (plus an optional
 *   cache-busting nonce). The fragment participates in `Uri.toString()`, so two
 *   repos with the same file at the same hash are distinct documents, while two
 *   views of one file in one repo still share a single document and editor.
 *   Putting the repo in `query` instead would need an escaping scheme for a
 *   path that may contain `?`, `&` and `#`.
 */

/** Authority sentinels standing in for a revision that has no commit hash. */
export const STAGED_AUTHORITY = 'staged';
export const WORKTREE_AUTHORITY = 'worktree';

export interface GitShowUriParts {
  /** The repository the revision is resolved against. */
  repoPath: string;
  /** A commit hash, or {@link STAGED_AUTHORITY} / {@link WORKTREE_AUTHORITY}. */
  revision: string;
  /** Repo-relative file path. */
  filePath: string;
  /** Human-readable label for the editor tab — display only. */
  label: string;
  /**
   * Cache-buster. VS Code caches virtual documents by URI, so a side whose
   * content can change without the URI changing — the working-tree side of a
   * submodule diff, whose pointer and `-dirty` suffix move on their own — must
   * carry one. Ordinary revisions are immutable and pass none.
   */
  nonce?: string;
}

export interface GitShowUriComponents {
  authority: string;
  path: string;
  query: string;
  fragment: string;
}

export function buildGitShowUriParts(parts: GitShowUriParts): GitShowUriComponents {
  const fragment = parts.nonce
    ? `repo=${encodeURIComponent(parts.repoPath)}&nonce=${encodeURIComponent(parts.nonce)}`
    : `repo=${encodeURIComponent(parts.repoPath)}`;

  return {
    authority: parts.revision,
    path: `/${parts.label}`,
    query: parts.filePath,
    fragment,
  };
}

/**
 * Read a URI back. Answers `null` when any required component is missing —
 * including a fragment-less URI, which the provider must refuse rather than
 * silently resolve against some "current" repository.
 */
export function parseGitShowUriParts(
  uri: Pick<GitShowUriComponents, 'authority' | 'query' | 'fragment'> & { path?: string },
): GitShowUriParts | null {
  if (!uri.authority || !uri.query || !uri.fragment) return null;

  const fields = new Map<string, string>();
  for (const pair of uri.fragment.split('&')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    fields.set(pair.slice(0, separator), decodeSafely(pair.slice(separator + 1)));
  }

  const repoPath = fields.get('repo');
  if (!repoPath) return null;

  const nonce = fields.get('nonce');
  return {
    repoPath,
    revision: uri.authority,
    filePath: uri.query,
    label: (uri.path ?? '').replace(/^\//, ''),
    ...(nonce ? { nonce } : {}),
  };
}

/** A fragment VS Code has already decoded contains no escapes to undo. */
function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
