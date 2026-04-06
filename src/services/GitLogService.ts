import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { parseCommitLine, parseBranchLine } from '../utils/gitParsers.js';
import { type Result, ok } from '../../shared/errors.js';
import type { Author, Commit, Branch, GraphFilters } from '../../shared/types.js';

export interface CommitsResult {
  commits: Commit[];
  totalLoadedWithoutFilter?: number;
}

// Git format placeholder %x00 outputs a null byte - used as field separator
const LOG_FORMAT = '%H%x00%h%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%D';

export class GitLogService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getCommits(filters?: Partial<GraphFilters>): Promise<Result<CommitsResult>> {
    this.log.info('Fetching commits');
    const maxCount = filters?.maxCount ?? 500;
    const args = ['log'];
    const revisionArgs: string[] = [];

    if (filters?.skip && filters.skip > 0) {
      args.push(`--skip=${filters.skip}`);
    }
    args.push(
      `--max-count=${maxCount}`,
      `--format=${LOG_FORMAT}`,
      '--date-order'
    );

    // Author filtering is handled client-side (visibility filter) — never pass --author to git.
    // This ensures the frontend has full commit ancestry for topology computation.

    if (filters?.afterDate) {
      args.push(`--after=${filters.afterDate}`);
    }
    if (filters?.beforeDate) {
      args.push(`--before=${filters.beforeDate}`);
    }

    // Add branch filter(s) or --all flag after options so refs are parsed as revisions.
    if (filters?.branches && filters.branches.length > 0) {
      revisionArgs.push(...filters.branches);
    } else {
      // Exclude stash refs — stashes are fetched separately via GitStashService
      // and merged into the graph by the frontend. Without this exclusion,
      // stash internal commits (index, untracked) pollute the graph and the
      // latest stash appears as a duplicate merge node.
      args.push('--exclude=refs/stash', '--all');
    }

    // Separate revisions from paths to avoid ambiguous argument errors
    args.push(...revisionArgs);
    args.push('--');

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

    const hasFilter = !!(filters?.branches?.length || filters?.afterDate || filters?.beforeDate);
    return ok({
      commits,
      totalLoadedWithoutFilter: hasFilter ? undefined : commits.length,
    });
  }

  async getAuthors(): Promise<Result<Author[]>> {
    this.log.info('Fetching authors');
    const result = await this.executor.execute({
      args: ['log', '--all', '--format=%an%x00%ae'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    const lines = result.value.stdout.trim().split('\n').filter(Boolean);
    const authorsByEmail = new Map<string, string>();

    for (const line of lines) {
      const sepIndex = line.indexOf('\0');
      if (sepIndex === -1) continue;
      const name = line.substring(0, sepIndex);
      const email = line.substring(sepIndex + 1);
      if (!authorsByEmail.has(email)) {
        authorsByEmail.set(email, name);
      }
    }

    const authors: Author[] = Array.from(authorsByEmail, ([email, name]) => ({ name, email }));
    authors.sort((a, b) => a.name.localeCompare(b.name));
    return ok(authors);
  }

  async getBranches(): Promise<Result<Branch[]>> {
    this.log.info('Fetching branches');
    // Use null byte separators for reliable parsing
    const result = await this.executor.execute({
      args: ['branch', '-a', '--format=%(refname:short)%00%(HEAD)%00%(objectname)'],
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

  async verifyRef(ref: string): Promise<Result<boolean>> {
    const result = await this.executor.execute({
      args: ['rev-parse', '--verify', ref],
      cwd: this.workspacePath,
    });
    return ok(result.success);
  }

  async getCurrentBranch(): Promise<Result<string>> {
    this.log.info('Getting current branch');
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
