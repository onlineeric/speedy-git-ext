import { DEFAULT_USER_SETTINGS, NO_GIT_TIMEOUT } from '../../shared/types.js';

/**
 * The timeout every git spawn uses, from `speedyGit.git.timeoutSeconds`.
 *
 * Held here rather than read from VS Code per spawn: a repo load makes many
 * spawns, and keeping `vscode` out of `GitExecutor` keeps it testable as plain
 * Node. `ExtensionController` is the only writer — once at activation and again
 * whenever the setting changes — so the next command picks up a new value with
 * no reload. It is extension-wide, like the setting itself.
 */
let timeoutSeconds = DEFAULT_USER_SETTINGS.gitTimeoutSeconds;

/**
 * The longest delay `setTimeout` honours (2^31 − 1 ms, about 24.8 days). Node
 * replaces a longer one with 1 ms, so an over-long timeout would kill every
 * command at once instead of never.
 */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Takes an already-normalized value (`normalizeGitTimeoutSeconds`). */
export function setGitCommandTimeoutSeconds(seconds: number): void {
  timeoutSeconds = seconds;
}

/** Seconds a git command may run, or `NO_GIT_TIMEOUT` (0) for no limit. */
export function gitCommandTimeoutSeconds(): number {
  return timeoutSeconds;
}

/**
 * The timer delay for a timeout of `seconds`, or `undefined` when no timer
 * should be armed: 0 means no timeout, and a value past what a timer can hold
 * is, for any real command, the same thing.
 */
export function gitCommandTimeoutDelayMs(seconds: number): number | undefined {
  if (seconds === NO_GIT_TIMEOUT) return undefined;
  const delayMs = seconds * 1000;
  return delayMs > MAX_TIMER_DELAY_MS ? undefined : delayMs;
}

/** Where the user can change the limit; part of every timeout message. */
export const GIT_TIMEOUT_SETTING_HINT =
  'To allow longer, raise "Git command timeout" in the View dialog\'s Git tab (speedyGit.git.timeoutSeconds), or set it to 0 for no timeout.';

/** What the user sees when a command is stopped: the limit, and where to raise it. */
export function gitTimeoutMessage(seconds: number): string {
  return `Git command timed out after ${seconds} seconds. ${GIT_TIMEOUT_SETTING_HINT}`;
}
