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
      args: ['stash', 'list', '--format=%H%x00%P%x00%gd%x00%gs%x00%aI'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const stdout = result.value.stdout.trim();
    if (!stdout) return ok([]);

    const stashes: StashEntry[] = [];
    for (const line of stdout.split('\n')) {
      const parts = line.split('\x00');
      if (parts.length < 5) continue;
      const [hash, parentHash, reflog, message, dateStr] = parts;
      // Extract index from reflog like "stash@{0}"
      const indexMatch = reflog.match(/\{(\d+)\}/);
      if (!indexMatch) continue;

      stashes.push({
        index: parseInt(indexMatch[1], 10),
        hash,
        parentHash: parentHash.split(' ')[0], // First parent only
        message,
        date: new Date(dateStr).getTime(),
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
