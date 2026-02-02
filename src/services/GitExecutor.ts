import { spawn } from 'child_process';
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
  async execute(options: GitExecOptions): Promise<Result<GitExecResult>> {
    const { args, cwd, timeout = 30000 } = options;

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
        safeResolve(
          err(
            new GitError(
              `Git command timed out after ${timeout}ms`,
              'TIMEOUT',
              `git ${args.join(' ')}`
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
        if (code !== 0) {
          if (stderr.includes('not a git repository')) {
            safeResolve(
              err(
                new GitError(
                  'Not a git repository',
                  'NOT_A_REPOSITORY',
                  `git ${args.join(' ')}`,
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
                  `git ${args.join(' ')}`,
                  stderr
                )
              )
            );
          }
        } else {
          safeResolve(ok({ stdout, stderr }));
        }
      });

      process.on('error', (error) => {
        safeResolve(
          err(
            new GitError(
              error.message,
              'UNKNOWN',
              `git ${args.join(' ')}`
            )
          )
        );
      });
    });
  }
}
