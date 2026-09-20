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
export function useCapturedRefExpectation(): {
  /** Call where the action starts — the menu click that opens the dialog. */
  capture: (expectation: RefExpectation | undefined) => void;
  /** Call at confirm. Clears itself, so a reopened dialog cannot reuse a stale capture. */
  take: () => RefExpectation | undefined;
} {
  const captured = useRef<RefExpectation | undefined>(undefined);
  return {
    capture: (expectation) => {
      captured.current = expectation;
    },
    take: () => {
      const expectation = captured.current;
      captured.current = undefined;
      return expectation;
    },
  };
}
