import { GitExecutor } from './GitExecutor.js';
import { parseCommitLine, parseBranchLine } from '../utils/gitParsers.js';
import { type Result, ok } from '../../shared/errors.js';
import type { Commit, Branch, GraphFilters } from '../../shared/types.js';

// Git format placeholder %x00 outputs a null byte - used as field separator
const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';

export class GitLogService {
  private executor: GitExecutor;

  constructor(private readonly workspacePath: string) {
    this.executor = new GitExecutor();
  }

  async getCommits(filters?: Partial<GraphFilters>): Promise<Result<Commit[]>> {
    const maxCount = filters?.maxCount ?? 500;
    const args = [
      'log',
      '--all',
      `--max-count=${maxCount}`,
      `--format=${LOG_FORMAT}`,
      '--date-order',
    ];

    if (filters?.branch) {
      args[1] = filters.branch;
    }

    if (filters?.author) {
      args.push(`--author=${filters.author}`);
    }

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const lines = result.value.stdout.trim().split('\n').filter(Boolean);
    const commits: Commit[] = [];

    for (const line of lines) {
      const parsed = parseCommitLine(line);
      if (parsed) {
        commits.push(parsed);
      }
    }

    return ok(commits);
  }

  async getBranches(): Promise<Result<Branch[]>> {
    const result = await this.executor.execute({
      args: ['branch', '-a', '--format=%(refname:short)%(HEAD)%(objectname:short)'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const lines = result.value.stdout.trim().split('\n').filter(Boolean);
    const branches: Branch[] = [];

    for (const line of lines) {
      const parsed = parseBranchLine(line);
      if (parsed) {
        branches.push(parsed);
      }
    }

    return ok(branches);
  }

  async getCurrentBranch(): Promise<Result<string>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--abbrev-ref', 'HEAD'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(result.value.stdout.trim());
  }
}
