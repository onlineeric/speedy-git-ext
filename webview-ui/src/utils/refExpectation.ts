/**
 * What a dialog tells the backend about where its target ref stood when the
 * user opened it.
 *
 * Only the five ref-position-dependent actions send one — reset, rebase onto,
 * force-push, delete branch and drop commit — because those are exactly the
 * ones git will not refuse on its own. Everything else relies on git failing.
 *
 * Every builder answers `undefined` when the ref is not in the loaded branch
 * list. That is deliberate: an absent expectation makes the backend act as it
 * always did, which is no protection but also no regression, and is far better
 * than sending a hash we guessed.
 */
import type { Branch } from '@shared/types';
import type { RefExpectation } from '@shared/refRevalidation';
import { findHeadCommitHash } from './commitRefs';

/** Minimal shape needed to spot the HEAD row by its decorations. */
interface DecoratedRow {
  hash: string;
  refs?: readonly { type: string }[];
}

/**
 * `HEAD` itself — used where the action is computed from the current tip
 * (dropping a commit, the near end of a rebase range).
 *
 * Read from the graph's own HEAD row rather than from the branch list, so it is
 * still correct in detached HEAD, where no branch points at the checkout.
 */
export function expectHead(commits: readonly DecoratedRow[]): RefExpectation | undefined {
  const expectedHash = findHeadCommitHash(commits);
  return expectedHash ? { ref: 'HEAD', expectedHash } : undefined;
}

/** A local branch by name. */
export function expectLocalBranch(branches: readonly Branch[], name: string): RefExpectation | undefined {
  const branch = branches.find((candidate) => !candidate.remote && candidate.name === name);
  return branch ? { ref: name, expectedHash: branch.hash } : undefined;
}

/**
 * A remote-tracking branch.
 *
 * The ref is qualified as `<remote>/<name>`, which is the only spelling that
 * reaches the right ref: a bare name silently resolves to a same-named local
 * branch, which is a different commit exactly when it matters.
 */
export function expectRemoteBranch(
  branches: readonly Branch[],
  remote: string,
  name: string,
): RefExpectation | undefined {
  const qualified = `${remote}/${name}`;
  const branch = branches.find(
    (candidate) => candidate.remote === remote && (candidate.name === name || candidate.name === qualified),
  );
  return branch ? { ref: qualified, expectedHash: branch.hash } : undefined;
}

/**
 * The branch the checkout currently sits on — the one a reset moves.
 *
 * Detached HEAD has no branch to name, so it falls back to `HEAD`, which is
 * what `git reset` moves there.
 */
export function expectCurrentBranch(
  branches: readonly Branch[],
  commits: readonly DecoratedRow[],
): RefExpectation | undefined {
  const current = branches.find((branch) => branch.current && !branch.remote);
  return current ? { ref: current.name, expectedHash: current.hash } : expectHead(commits);
}

/**
 * The far end of a rebase — whatever ref the user picked to rebase onto.
 *
 * A rebase target may be a commit hash rather than a ref name, in which case it
 * is immovable and there is nothing to revalidate.
 */
export function expectRebaseTarget(branches: readonly Branch[], targetRef: string): RefExpectation | undefined {
  const branch = branches.find((candidate) => refNameOf(candidate) === targetRef);
  return branch ? { ref: targetRef, expectedHash: branch.hash } : undefined;
}

function refNameOf(branch: Branch): string {
  if (!branch.remote) return branch.name;
  return branch.name.startsWith(`${branch.remote}/`) ? branch.name : `${branch.remote}/${branch.name}`;
}
