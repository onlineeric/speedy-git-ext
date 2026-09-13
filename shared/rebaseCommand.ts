import { usesNonInteractiveAutosquash, type GitVersion } from './gitVersion.js';

/**
 * `git rebase <upstream>` argument building for "Rebase Current Branch onto…",
 * shared by the backend that runs it and the dialog that previews it.
 */

export interface RebaseArgsOptions {
  targetRef: string;
  ignoreDate: boolean;
  autosquash: boolean;
  gitVersion: GitVersion | null;
}

export interface RebaseArgs {
  args: string[];
  /**
   * The `-i` form needs `GIT_SEQUENCE_EDITOR` set to a no-op so git's own
   * (autosquashed) todo list is accepted without opening an editor.
   */
  needsNoOpSequenceEditor: boolean;
}

/**
 * - not autosquash: `rebase [--ignore-date] <ref>`
 * - autosquash, git 2.44+: `rebase --autosquash [--ignore-date] <ref>`
 * - autosquash, older or unknown git: `rebase -i --autosquash --empty=drop [--ignore-date] <ref>`.
 *   Before 2.44 git silently ignores `--autosquash` without `-i`; `--empty=drop`
 *   keeps `-i` from pausing on a commit that became empty, where the plain form
 *   would drop it and finish.
 */
export function buildRebaseArgs(options: RebaseArgsOptions): RebaseArgs {
  const { targetRef, ignoreDate, autosquash, gitVersion } = options;
  const args = ['rebase'];
  const interactive = autosquash && !usesNonInteractiveAutosquash(gitVersion);

  if (interactive) args.push('-i', '--autosquash', '--empty=drop');
  else if (autosquash) args.push('--autosquash');
  if (ignoreDate) args.push('--ignore-date');
  args.push(targetRef);

  return { args, needsNoOpSequenceEditor: interactive };
}
