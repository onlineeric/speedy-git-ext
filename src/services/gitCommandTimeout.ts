import { DEFAULT_USER_SETTINGS } from '../../shared/types.js';

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

/** Takes an already-normalized value (`normalizeGitTimeoutSeconds`). */
export function setGitCommandTimeoutSeconds(seconds: number): void {
  timeoutSeconds = seconds;
}

/** Seconds a git command may run, or `NO_GIT_TIMEOUT` (0) for no limit. */
export function gitCommandTimeoutSeconds(): number {
  return timeoutSeconds;
}

/** What the user sees when a command is stopped: the limit, and where to raise it. */
export function gitTimeoutMessage(seconds: number): string {
  return `Git command timed out after ${seconds} seconds. To allow longer, raise "Git command timeout" in the View dialog's Git tab (speedyGit.git.timeoutSeconds), or set it to 0 for no timeout.`;
}
