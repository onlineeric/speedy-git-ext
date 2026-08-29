import type { RefInfo } from '@shared/types';

/**
 * What a ref badge's "Create worktree…" item bases the worktree on.
 *
 * The ref-badge sibling of {@link ./refMergeSource}: both answer "what does this
 * badge hand to the git command", and both exist because the answer is not simply
 * the badge's name. A remote branch must reach `git worktree add` as
 * `<remote>/<name>` — the bare name would silently resolve to a same-named local
 * branch, which is a different commit whenever the two have diverged.
 */

export type WorktreeSourceKind = 'local-branch' | 'remote-branch' | 'commit' | 'tag';

export interface WorktreeSource {
  /** The git ref the worktree is based on: branch name, `origin/x`, tag name, or commit hash. */
  ref: string;
  /** Human-readable label shown in the dialog. */
  label: string;
  kind: WorktreeSourceKind;
}

/**
 * The worktree source for a ref badge, or null for a badge a worktree cannot be
 * created from (a stash).
 *
 * Deliberately does **not** ask whether a local branch of the same name exists.
 * `git worktree add` is perfectly happy to base a worktree on `origin/foo` while a
 * local `foo` sits somewhere else — that divergence is the usual reason to want the
 * worktree in the first place. Gating on it hid the item on exactly the rows where
 * it was most useful, and a name that then turns out to be taken is git's to refuse
 * in the dialog, not ours to pre-empt by removing the menu item.
 */
export function refWorktreeSource(refInfo: RefInfo): WorktreeSource | null {
  switch (refInfo.type) {
    case 'branch':
      // A local badge (merged badges also arrive as `branch`) checks out the branch itself.
      return { ref: refInfo.name, label: refInfo.name, kind: 'local-branch' };
    case 'remote': {
      if (!refInfo.remote) return null;
      const full = `${refInfo.remote}/${refInfo.name}`;
      return { ref: full, label: full, kind: 'remote-branch' };
    }
    case 'tag':
      return { ref: refInfo.name, label: refInfo.name, kind: 'tag' };
    default:
      return null;
  }
}
