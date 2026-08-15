import { useEffect, useState } from 'react';

/**
 * Seconds still to wait. Clamped at both ends: never below zero, and never above
 * the starting value — a clock reading taken before the deadline was set would
 * otherwise briefly show one second too many.
 */
export function remainingSeconds(deadline: number, now: number, seconds: number): number {
  return Math.min(seconds, Math.max(0, Math.ceil((deadline - now) / 1000)));
}

/** Ticks faster than once a second so the displayed number changes on time rather than drifting. */
const TICK_MS = 250;

/**
 * Counts `seconds` down to 0 while `active`, returning the seconds remaining.
 *
 * Each tick is measured against a fixed deadline rather than decrementing a
 * counter, so a webview throttled in a background tab resumes at the right
 * number instead of finishing late by however many ticks it missed.
 *
 * The wait is armed on mount, which suits a dialog that is mounted when it opens
 * (`{state && <Dialog … />}`). Flipping `active` on an already-mounted hook
 * restarts the timer, but the returned value only catches up on the first tick —
 * so mount the hook fresh rather than toggling it if that matters.
 */
export function useCountdown(seconds: number, active: boolean): number {
  const [remaining, setRemaining] = useState(active ? seconds : 0);

  useEffect(() => {
    if (!active || seconds <= 0) return;

    const deadline = Date.now() + seconds * 1000;
    const timer = setInterval(() => {
      setRemaining(remainingSeconds(deadline, Date.now(), seconds));
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [active, seconds]);

  return active ? remaining : 0;
}
