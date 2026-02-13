import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { RemoteInfo } from '../../shared/types.js';
import { validateRefName } from '../utils/gitValidation.js';

export class GitRemoteService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async push(remote?: string, branch?: string, setUpstream?: boolean, force?: boolean): Promise<Result<string>> {
    this.log.info(`Push${remote ? ` to ${remote}` : ''}${branch ? `/${branch}` : ''}${force ? ' (force-with-lease)' : ''}`);
    if (remote) {
      const check = validateRefName(remote);
      if (!check.success) return check;
    }
    if (branch) {
      const check = validateRefName(branch);
      if (!check.success) return check;
    }

    const args = ['push'];
    if (setUpstream) args.push('-u');
    if (force) args.push('--force-with-lease');
    if (remote) args.push(remote);
    if (branch) args.push(branch);

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
      timeout: 60000,
    });
    if (!result.success) return result;
    return ok('Push completed');
  }

  async pull(remote?: string, branch?: string, rebase?: boolean): Promise<Result<string>> {
    this.log.info(`Pull${remote ? ` from ${remote}` : ''}${branch ? `/${branch}` : ''}${rebase ? ' --rebase' : ''}`);
    if (remote) {
      const check = validateRefName(remote);
      if (!check.success) return check;
    }
    if (branch) {
      const check = validateRefName(branch);
      if (!check.success) return check;
    }

    const args = ['pull'];
    if (rebase) args.push('--rebase');
    if (remote) args.push(remote);
    if (branch) args.push(branch);

    const result = await this.executor.execute({
      args,
      cwd: this.workspacePath,
      timeout: 60000,
    });
    if (!result.success) return result;
    return ok('Pull completed');
  }

  async getRemotes(): Promise<Result<RemoteInfo[]>> {
    this.log.info('Get remotes');
    const result = await this.executor.execute({
      args: ['remote', '-v'],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const remoteMap = new Map<string, RemoteInfo>();
    for (const line of result.value.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Format: origin	https://github.com/user/repo.git (fetch)
      const match = trimmed.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
      if (!match) continue;
      const [, name, url, type] = match;
      const existing = remoteMap.get(name) ?? { name, fetchUrl: '', pushUrl: '' };
      if (type === 'fetch') existing.fetchUrl = url;
      else existing.pushUrl = url;
      remoteMap.set(name, existing);
    }

    return ok(Array.from(remoteMap.values()));
  }

  async addRemote(name: string, url: string): Promise<Result<string>> {
    this.log.info(`Add remote: ${name} → ${url}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['remote', 'add', name, url],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Added remote '${name}'`);
  }

  async removeRemote(name: string): Promise<Result<string>> {
    this.log.info(`Remove remote: ${name}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['remote', 'remove', name],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Removed remote '${name}'`);
  }

  async editRemote(name: string, newUrl: string): Promise<Result<string>> {
    this.log.info(`Edit remote: ${name} → ${newUrl}`);
    const nameCheck = validateRefName(name);
    if (!nameCheck.success) return nameCheck;

    const result = await this.executor.execute({
      args: ['remote', 'set-url', name, newUrl],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;
    return ok(`Updated remote '${name}' URL`);
  }
}
