import * as fs from 'fs';
import * as path from 'path';
import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { GitError, type Result, ok, err } from '../../shared/errors.js';
import type { CherryPickOptions, CherryPickState } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';
import { isConflictStderr, isNothingToApplyStderr } from '../utils/gitParsers.js';

export class GitCherryPickService {
  private executor: GitExecutor;
  private readonly cherryPickHeadPath: string;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
    this.cherryPickHeadPath = path.join(workspacePath, '.git', 'CHERRY_PICK_HEAD');
  }

  getCherryPickState(): Result<CherryPickState> {
    const state: CherryPickState = fs.existsSync(this.cherryPickHeadPath) ? 'in-progress' : 'idle';
    return ok(state);
  }

  async cherryPick(hashes: string[], options: CherryPickOptions): Promise<Result<string>> {
    for (const hash of hashes) {
      const hashCheck = validateHash(hash);
      if (!hashCheck.success) return hashCheck;
    }

    // No working-tree pre-check: `git cherry-pick` accepts untracked files and tracked
    // edits that the patch does not touch, and refuses — naming the files — only when it
    // would overwrite a locally modified one (or when the index differs from HEAD, for
    // the commit-producing form). It leaves no CHERRY_PICK_HEAD behind when it refuses,
    // so that failure cannot be mistaken for a paused cherry-pick below. A refused
    // *multi-commit* pick does leave `.git/sequencer/` behind, but nothing here reads
    // it and the next pick overwrites it, so it is inert.
    const args = ['cherry-pick'];
    if (options.mainlineParent !== undefined) {
      args.push('-m', String(options.mainlineParent));
    }
    if (options.appendSourceRef && !options.noCommit) {
      args.push('-x');
    }
    if (options.noCommit) {
      args.push('--no-commit');
    }
    args.push(...hashes);

    this.log.info(`Cherry-pick: ${hashes.join(' ')}`);
    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) {
      const stderr = result.error.stderr ?? '';
      if (isNothingToApplyStderr(stderr)) {
        return err(new GitError(
          'This commit introduces no new changes to the current branch (empty cherry-pick). Nothing was committed.',
          'COMMAND_FAILED'
        ));
      }
      if (fs.existsSync(this.cherryPickHeadPath) || isConflictStderr(stderr)) {
        return err(new GitError(
          'Cherry-pick paused due to conflict. Resolve conflicts in the Source Control panel, then continue.',
          'CHERRY_PICK_CONFLICT'
        ));
      }
      return result;
    }

    const n = hashes.length;
    return ok(`Cherry-picked ${n} commit${n !== 1 ? 's' : ''} onto the current branch.`);
  }

  async abortCherryPick(): Promise<Result<string>> {
    this.log.info('Abort cherry-pick');
    const result = await this.executor.execute({
      args: ['cherry-pick', '--abort'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Cherry-pick aborted.');
  }

  async continueCherryPick(): Promise<Result<string>> {
    this.log.info('Continue cherry-pick');
    const result = await this.executor.execute({
      args: ['cherry-pick', '--continue'],
      cwd: this.workspacePath,
      // `--continue` commits the resolved pick through the commit message editor,
      // which `GitExecutor`'s default `GIT_EDITOR` accepts unchanged.
    });
    if (!result.success) return result;
    return ok('Cherry-pick continued successfully.');
  }

}
