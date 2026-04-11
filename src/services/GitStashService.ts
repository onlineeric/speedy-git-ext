import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok, err, GitError } from '../../shared/errors.js';
import type { StashEntry } from '../../shared/types.js';

export class GitStashService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getStashes(): Promise<Result<StashEntry[]>> {
    this.log.info('Get stashes');
    const result = await this.executor.execute({
      args: ['stash', 'list', '--format=%H%x00%P%x00%gd%x00%gs%x00%aI%x00%an%x00%ae'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const stdout = result.value.stdout.trim();
    if (!stdout) return ok([]);

    const stashes: StashEntry[] = [];
    for (const line of stdout.split('\n')) {
      const parts = line.split('\x00');
      if (parts.length < 7) continue;
      const [hash, parentHash, reflog, message, dateStr, author, authorEmail] = parts;
      // Extract index from reflog like "stash@{0}"
      const indexMatch = reflog.match(/\{(\d+)\}/);
      if (!indexMatch) continue;

      stashes.push({
        index: parseInt(indexMatch[1], 10),
        hash,
        parentHash: parentHash.split(' ')[0], // First parent only
        message,
        date: new Date(dateStr).getTime(),
        author,
        authorEmail,
      });
    }

    return ok(stashes);
  }

  async applyStash(index: number): Promise<Result<string>> {
    this.log.info(`Apply stash@{${index}}`);
    if (index < 0 || !Number.isInteger(index)) {
      return err(new GitError(`Invalid stash index: ${index}`, 'VALIDATION_ERROR'));
    }

    const result = await this.executor.execute({
      args: ['stash', 'apply', `stash@{${index}}`],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Applied stash@{${index}}`);
  }

  async popStash(index: number): Promise<Result<string>> {
    this.log.info(`Pop stash@{${index}}`);
    if (index < 0 || !Number.isInteger(index)) {
      return err(new GitError(`Invalid stash index: ${index}`, 'VALIDATION_ERROR'));
    }

    const result = await this.executor.execute({
      args: ['stash', 'pop', `stash@{${index}}`],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Popped stash@{${index}}`);
  }

  async stash(): Promise<Result<string>> {
    this.log.info('Stash changes');
    const result = await this.executor.execute({
      args: ['stash'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok('Stashed changes');
  }

  async stashWithMessage(message?: string, paths?: string[]): Promise<Result<string>> {
    const scopeLabel = paths && paths.length > 0 ? `${paths.length} file(s)` : 'all';
    this.log.info(`Stash with message: ${message ?? '(none)'}, scope: ${scopeLabel}`);
    const args = ['stash', 'push', '--include-untracked'];
    if (message) {
      args.push('-m', message);
    }
    if (paths && paths.length > 0) {
      args.push('--', ...paths);
    }
    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(message ? `Stashed changes: ${message}` : 'Stashed changes');
  }

  /**
   * Stash a user-selected subset of uncommitted files. When
   * `addUntrackedFirst` is true, first runs `git add --` on the paths because
   * `git stash push -- <paths>` does not include untracked files via `-u`.
   * If the stash push fails after a successful add, returns an augmented
   * error that names both steps so the dialog can show the tree state.
   */
  async stashSelected(
    message: string,
    paths: string[],
    addUntrackedFirst: boolean,
  ): Promise<Result<string>> {
    this.log.info(
      `Stash selected: ${paths.length} file(s), addUntrackedFirst=${addUntrackedFirst}, message="${message}"`,
    );

    if (paths.length === 0) {
      return err(new GitError('stashSelected: no paths provided', 'VALIDATION_ERROR'));
    }

    if (addUntrackedFirst) {
      const addResult = await this.executor.execute({
        args: ['add', '--', ...paths],
        cwd: this.workspacePath,
      });
      if (!addResult.success) return addResult;
    }

    const stashResult = await this.executor.execute({
      args: ['stash', 'push', '-m', message, '--', ...paths],
      cwd: this.workspacePath,
    });

    if (!stashResult.success) {
      if (addUntrackedFirst) {
        const augmented = new GitError(
          `git add succeeded; git stash push failed with: ${stashResult.error.message}. Selected untracked files are now staged.`,
          stashResult.error.code,
        );
        return err(augmented);
      }
      return stashResult;
    }

    return ok(`Stashed changes: ${message}`);
  }

  async dropStash(index: number): Promise<Result<string>> {
    this.log.info(`Drop stash@{${index}}`);
    if (index < 0 || !Number.isInteger(index)) {
      return err(new GitError(`Invalid stash index: ${index}`, 'VALIDATION_ERROR'));
    }

    const result = await this.executor.execute({
      args: ['stash', 'drop', `stash@{${index}}`],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Dropped stash@{${index}}`);
  }
}
