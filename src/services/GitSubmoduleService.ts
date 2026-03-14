import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { Submodule, SubmoduleStatus } from '../../shared/types.js';

const SUBMODULE_LINE_PATTERN = /^([ +\-U])([0-9a-f]+)\s+([^\s]+)(?:\s+\((.+)\))?$/i;
const GITMODULES_PATH_KEY = /^submodule\.(.+)\.path$/;
const GITMODULES_URL_KEY = /^submodule\.(.+)\.url$/;

export class GitSubmoduleService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getSubmodules(): Promise<Result<Submodule[]>> {
    const [statusResult, pathMap, urlMap] = await Promise.all([
      this.executor.execute({
        args: ['submodule', 'status'],
        cwd: this.workspacePath,
      }),
      this.readGitmodulesMap('path'),
      this.readGitmodulesMap('url'),
    ]);

    if (!statusResult.success) {
      const stderr = statusResult.error.stderr ?? '';
      if (statusResult.error.code === 'COMMAND_FAILED' && stderr.includes('No such file or directory')) {
        return ok([]);
      }
      return statusResult;
    }

    const lines = statusResult.value.stdout
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean);

    return ok(
      lines
        .map((line) => this.parseSubmoduleLine(line, pathMap, urlMap))
        .filter((submodule): submodule is Submodule => submodule !== null)
    );
  }

  async updateSubmodule(submodulePath: string): Promise<Result<string>> {
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

  private parseSubmoduleLine(
    line: string,
    pathMap: Map<string, string>,
    urlMap: Map<string, string>
  ): Submodule | null {
    const match = line.match(SUBMODULE_LINE_PATTERN);
    if (!match) return null;

    const [, prefix, hash, submodulePath, describe = ''] = match;
    const status = this.getStatus(prefix);
    const url = this.findUrlForPath(submodulePath, pathMap, urlMap);

    return {
      path: submodulePath,
      hash,
      status,
      describe,
      url,
    };
  }

  private getStatus(prefix: string): SubmoduleStatus {
    switch (prefix) {
      case '-':
        return 'uninitialized';
      case '+':
      case 'U':
        return 'dirty';
      default:
        return 'clean';
    }
  }

  private findUrlForPath(
    submodulePath: string,
    pathMap: Map<string, string>,
    urlMap: Map<string, string>
  ): string | undefined {
    for (const [name, mappedPath] of pathMap.entries()) {
      if (mappedPath === submodulePath) {
        return urlMap.get(name);
      }
    }
    return undefined;
  }
}
