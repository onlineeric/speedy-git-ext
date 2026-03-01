import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import { validateRefName, validateHash } from '../utils/gitValidation.js';

export class GitTagService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async createTag(name: string, hash: string, message?: string): Promise<Result<string>> {
    this.log.info(`Create tag: ${name} at ${hash}${message ? ' (annotated)' : ''}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const args = ['tag'];
    if (message) {
      args.push('-a', '-m', message);
    }
    args.push(name, hash);

    const result = await this.executor.execute({ args, cwd: this.workspacePath });
    if (!result.success) return result;
    return ok(`Created tag '${name}'`);
  }

  async deleteTag(name: string): Promise<Result<string>> {
    this.log.info(`Delete tag: ${name}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['tag', '-d', name],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Deleted tag '${name}'`);
  }

  async pushTag(name: string, remote?: string): Promise<Result<string>> {
    this.log.info(`Push tag: ${name} to ${remote ?? 'origin'}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;
    if (remote) {
      const remoteCheck = validateRefName(remote);
      if (!remoteCheck.success) return remoteCheck;
    }

    const result = await this.executor.execute({
      args: ['push', remote ?? 'origin', `refs/tags/${name}`],
      cwd: this.workspacePath,
      timeout: 60000,
    });
    if (!result.success) return result;
    return ok(`Pushed tag '${name}'`);
  }
}
