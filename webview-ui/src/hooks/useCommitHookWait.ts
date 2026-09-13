import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * How long a commit may run before the dialog stops looking merely slow.
 *
 * Committing runs `pre-commit` and `commit-msg` hooks — git runs them even for a
 * message-only amend — and hook output is invisible from here. In a husky /
 * lint-staged repo that is tens of seconds of apparent nothing, so past this
 * point the wait is named as the repo's own tooling and given a way out. Fast
 * repos finish long before and never see it.
 */
export const HOOK_WAIT_NOTICE_MS = 3_000;

/**
 * Idle, running, and running long enough to name the hooks. One value rather
 * than two booleans: the fourth combination they could spell (waiting on hooks
 * while not running) does not exist, and every exit has to clear both.
 */
export type CommitPhase = 'idle' | 'running' | 'waitingOnHooks';

/** The running/hook-wait phase shared by the dialogs that create or rewrite commits. */
export function useCommitHookWait() {
  const [phase, setPhase] = useState<CommitPhase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = useCallback(() => {
    // A second start must not orphan the first timer: it would fire after
    // `finish` and leave an idle dialog showing "Cancel wait".
    clearTimeout(timer.current);
    setPhase('running');
    timer.current = setTimeout(() => setPhase('waitingOnHooks'), HOOK_WAIT_NOTICE_MS);
  }, []);

  const finish = useCallback(() => {
    clearTimeout(timer.current);
    setPhase('idle');
  }, []);

  return { phase, isRunning: phase !== 'idle', start, finish };
}
