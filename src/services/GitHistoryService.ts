import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { ResetMode, CommitParentInfo } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';

export class GitHistoryService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async reset(targetHash: string, mode: ResetMode): Promise<Result<string>> {
    this.log.info(`Reset branch: ${targetHash} (${mode})`);
    const hashCheck = validateHash(targetHash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['reset', `--${mode}`, targetHash],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Reset to ${targetHash.slice(0, 7)} (${mode})`);
  }

  async isCommitPushed(hash: string): Promise<Result<boolean>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['branch', '-r', '--contains', hash],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    return ok(result.value.stdout.trim().length > 0);
  }

  async getCommitParents(hashes: string[]): Promise<Result<CommitParentInfo[]>> {
    for (const hash of hashes) {
      const hashCheck = validateHash(hash);
      if (!hashCheck.success) return hashCheck;
    }

    const parents: CommitParentInfo[] = [];
    for (const hash of hashes) {
      const result = await this.executor.execute({
        args: ['log', '-1', '--format=%H%x00%h%x00%s', hash, '--'],
        cwd: this.workspacePath,
      });
      if (!result.success) return result;
      const [fullHash, abbreviatedHash, ...subjectParts] = result.value.stdout.trim().split('\x00');
      parents.push({
        hash: fullHash,
        abbreviatedHash,
        subject: subjectParts.join('\x00'),
      });
    }

    return ok(parents);
  }
}
