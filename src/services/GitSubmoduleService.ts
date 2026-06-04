import type { LogOutputChannel } from 'vscode';
import * as path from 'path';
import { existsSync } from 'fs';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { Submodule } from '../../shared/types.js';

const GITMODULES_PATH_KEY = /^submodule\.(.+)\.path$/;
const GITMODULES_URL_KEY = /^submodule\.(.+)\.url$/;

export class GitSubmoduleService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getSubmodules(): Promise<Result<Submodule[]>> {
    // Fast-path: skip all git commands if no .gitmodules file exists.
    // `git submodule status` is very slow on some systems (2s+), so avoid
    // spawning it in the common case where the repo has no submodules.
    const gitmodulesPath = path.join(this.workspacePath, '.gitmodules');
    if (!existsSync(gitmodulesPath)) {
      this.log.info('Get submodules (skipped: no .gitmodules)');
      return ok([]);
    }

    this.log.info('Get submodules from .gitmodules');
    const [pathMap, urlMap] = await Promise.all([
      this.readGitmodulesMap('path'),
      this.readGitmodulesMap('url'),
    ]);

    const submodules = Array.from(pathMap.entries())
      .map(([name, submodulePath]): Submodule => {
        const initialized = existsSync(path.join(this.workspacePath, submodulePath, '.git'));
        return {
          path: submodulePath,
          hash: '',
          status: initialized ? 'clean' : 'uninitialized',
          describe: '',
          url: urlMap.get(name),
          initialized,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    return ok(submodules);
  }

  async updateSubmodule(submodulePath: string): Promise<Result<string>> {
    this.log.info(`Update submodule: ${submodulePath}`);
    const result = await this.executor.execute({
      args: ['submodule', 'update', '--init', '--', submodulePath],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Updated submodule ${submodulePath}`);
  }

  async initSubmodule(submodulePath: string): Promise<Result<string>> {
    this.log.info(`Init submodule: ${submodulePath}`);
    const result = await this.executor.execute({
      args: ['submodule', 'update', '--init', '--', submodulePath],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return result;
    }

    return ok(`Initialized submodule ${submodulePath}`);
  }

  private async readGitmodulesMap(kind: 'path' | 'url'): Promise<Map<string, string>> {
    const keyPattern = kind === 'path'
      ? '^submodule\\..*\\.path$'
      : '^submodule\\..*\\.url$';
    const result = await this.executor.execute({
      args: ['config', '--file', '.gitmodules', '--get-regexp', keyPattern],
      cwd: this.workspacePath,
    });

    if (!result.success) {
      return new Map();
    }

    const map = new Map<string, string>();
    for (const line of result.value.stdout.split('\n')) {
      if (!line.trim()) continue;
      const firstSpace = line.indexOf(' ');
      if (firstSpace === -1) continue;
      const key = line.slice(0, firstSpace).trim();
      const value = line.slice(firstSpace + 1).trim();
      const match = kind === 'path'
        ? key.match(GITMODULES_PATH_KEY)
        : key.match(GITMODULES_URL_KEY);
      if (match) {
        map.set(match[1], value);
      }
    }
    return map;
  }

}
