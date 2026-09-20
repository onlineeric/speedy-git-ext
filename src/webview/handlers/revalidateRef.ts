import { GitError } from '../../../shared/errors.js';
import { describeRefMoved, isRefMoved, type RefExpectation } from '../../../shared/refRevalidation.js';
import type { WebviewRequestContext } from '../WebviewRequestContext.js';

/**
 * Re-read a ref immediately before acting on it, and answer a `GitError` when
 * it no longer points where the dialog said it did.
 *
 * Only the five actions git will not refuse on its own call this — reset,
 * rebase onto, force-push, delete branch and drop commit. Everything else
 * relies on git failing.
 *
 * An absent `expect` returns `null` and the handler proceeds exactly as before,
 * so no call site is forced to opt in and none regresses by omission.
 */
export async function revalidateRef(
  expect: RefExpectation | undefined,
  context: WebviewRequestContext,
): Promise<GitError | null> {
  if (!expect) return null;

  const actual = await context.services.current().gitLogService.resolveRefHash(expect.ref);
  if (!isRefMoved(expect, actual)) return null;

  return new GitError(describeRefMoved(expect.ref, actual), 'REF_MOVED');
}

/**
 * Post the refusal and answer `true` when the handler must stop. One line at
 * each of the five call sites, ahead of the mutation and after the operation
 * guard.
 *
 * Variadic because an action can have more than one movable end — a rebase
 * revalidates the onto ref *and* HEAD. The reads are issued together, but the
 * refusal reported is the first expectation's, in argument order, so the message
 * names the ref the caller considers primary.
 */
export async function postRefMoved(
  context: WebviewRequestContext,
  ...expectations: (RefExpectation | undefined)[]
): Promise<boolean> {
  const results = await Promise.all(expectations.map((expect) => revalidateRef(expect, context)));
  const moved = results.find((result) => result !== null);
  if (!moved) return false;
  context.postMessage({ type: 'error', payload: { error: moved } });
  return true;
}
