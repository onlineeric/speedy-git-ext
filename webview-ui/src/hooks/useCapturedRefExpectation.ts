import { useRef } from 'react';
import type { RefExpectation } from '@shared/refRevalidation';

/**
 * Hold where a dialog's target ref stood **when the dialog opened**, for the
 * backend's stale-ref check.
 *
 * Capturing at confirm time would defeat the whole mechanism: the tab
 * auto-refreshes while a dialog sits open, so by the time the user presses the
 * button the store already holds the ref's *new* position, and the comparison
 * would always pass. The expectation has to be the position the user actually
 * saw.
 */
export function useCapturedRefExpectation<T = RefExpectation | undefined>(): {
  /**
   * Call where the action starts — the menu click that opens the dialog.
   *
   * `T` widens to a *group* of expectations for an action with more than one
   * movable end — a rebase revalidates both the onto ref and HEAD — so the two
   * are captured and released as one and cannot get out of step.
   */
  capture: (expectation: T) => void;
  /**
   * Call at an intermediate step that git may still turn into a second,
   * stronger attempt — `branch -d` answering `deleteBranchNeedsForce`, whose
   * retry is the `branch -D` that actually discards commits. Keeps the capture
   * so the retry carries the same expectation.
   */
  peek: () => T | undefined;
  /** Call at confirm. Clears itself, so a reopened dialog cannot reuse a stale capture. */
  take: () => T | undefined;
} {
  const captured = useRef<T | undefined>(undefined);
  return {
    capture: (expectation) => {
      captured.current = expectation;
    },
    peek: () => captured.current,
    take: () => {
      const expectation = captured.current;
      captured.current = undefined;
      return expectation;
    },
  };
}
