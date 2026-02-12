import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';

export class GitConfigService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getConfig(key: string, scope?: 'local' | 'global'): Promise<Result<string>> {
    const args = ['config'];
    if (scope) {
      args.push(`--${scope}`);
    }
    args.push('--get', key);

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(result.value.stdout.trim());
  }

  async setConfig(key: string, value: string, scope?: 'local' | 'global'): Promise<Result<string>> {
    const args = ['config'];
    if (scope) {
      args.push(`--${scope}`);
    }
    args.push(key, value);

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Set ${key} = ${value}`);
  }

  async unsetConfig(key: string, scope?: 'local' | 'global'): Promise<Result<string>> {
    const args = ['config'];
    if (scope) {
      args.push(`--${scope}`);
    }
    args.push('--unset', key);

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Unset ${key}`);
  }

  async getGitVersion(): Promise<Result<string>> {
    const result = await this.executor.execute({
      args: ['--version'],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    // Output is "git version 2.x.y"
    const version = result.value.stdout.trim().replace('git version ', '');
    return ok(version);
  }
}
