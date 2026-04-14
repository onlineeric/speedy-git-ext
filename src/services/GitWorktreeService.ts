import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { WorktreeInfo } from '../../shared/types.js';

export class GitWorktreeService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async listWorktrees(): Promise<Result<WorktreeInfo[]>> {
    this.log.info('List worktrees');
    const result = await this.executor.execute({
      args: ['worktree', 'list', '--porcelain'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      this.log.warn(`git worktree list failed, returning empty: ${result.error.message}`);
      return ok([]);
    }

    const stdout = result.value.stdout.trim();
    if (!stdout) return ok([]);

    const worktrees: WorktreeInfo[] = [];
    const blocks = stdout.split('\n\n');
    let isFirst = true;

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      let path = '';
      let head = '';
      let branch = '';
      let isDetached = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length);
        } else if (line === 'detached') {
          isDetached = true;
        }
      }

      if (path && head) {
        worktrees.push({
          path,
          head,
          branch,
          isMain: isFirst,
          isDetached,
        });
      }

      isFirst = false;
    }

    return ok(worktrees);
  }
}
