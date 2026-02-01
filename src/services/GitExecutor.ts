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
      let killed = false;

      const timeoutId = setTimeout(() => {
        killed = true;
        process.kill();
        resolve(
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
        clearTimeout(timeoutId);
        if (killed) return;

        if (code !== 0) {
          if (stderr.includes('not a git repository')) {
            resolve(
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
            resolve(
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
          resolve(ok({ stdout, stderr }));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timeoutId);
        if (killed) return;
        resolve(
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
