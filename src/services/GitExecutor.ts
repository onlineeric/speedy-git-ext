import { spawn } from 'child_process';
import type { LogOutputChannel } from 'vscode';
import { GitError, type Result, ok, err } from '../../shared/errors.js';

export interface GitExecOptions {
  args: string[];
  cwd: string;
  timeout?: number;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export class GitExecutor {
  constructor(private readonly log: LogOutputChannel) {}

  async execute(options: GitExecOptions): Promise<Result<GitExecResult>> {
    const { args, cwd, timeout = 30000 } = options;
    const cmdString = `git ${args.join(' ')}`;
    this.log.debug(`Executing: ${cmdString}`);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const process = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const safeResolve = (result: Result<GitExecResult>) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        process.kill();
        this.log.error(`Git command timed out after ${timeout}ms: ${cmdString}`);
        safeResolve(
          err(
            new GitError(
              `Git command timed out after ${timeout}ms`,
              'TIMEOUT',
              cmdString
            )
          )
        );
      }, timeout);

      process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        const elapsed = Date.now() - startTime;
        if (code !== 0) {
          this.log.error(`Git command failed: ${cmdString} — stderr: ${stderr.trim()}`);
          if (stderr.includes('not a git repository')) {
            safeResolve(
              err(
                new GitError(
                  'Not a git repository',
                  'NOT_A_REPOSITORY',
                  cmdString,
                  stderr
                )
              )
            );
          } else {
            safeResolve(
              err(
                new GitError(
                  `Git command failed with code ${code}`,
                  'COMMAND_FAILED',
                  cmdString,
                  stderr
                )
              )
            );
          }
        } else {
          this.log.debug(`Git command completed in ${elapsed}ms`);
          safeResolve(ok({ stdout, stderr }));
        }
      });

      process.on('error', (error) => {
        this.log.error(`Git command error: ${cmdString} — ${error.message}`);
        safeResolve(
          err(
            new GitError(
              error.message,
              'UNKNOWN',
              cmdString
            )
          )
        );
      });
    });
  }
}
