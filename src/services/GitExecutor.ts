import { spawn } from 'child_process';
import type { LogOutputChannel } from 'vscode';
import { GitError, type Result, ok, err } from '../../shared/errors.js';

export interface GitExecOptions {
  args: string[];
  cwd: string;
  timeout?: number;
  env?: Record<string, string>;
  /** Optional cancellation signal. When aborted, the spawned process is killed
   *  and the executor resolves with a `'CANCELLED'` GitError. If the signal is
   *  already aborted at call time, the executor short-circuits without spawning.
   *  Added for 042-compare-refs (FR-025b). */
  abortSignal?: AbortSignal;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export class GitExecutor {
  constructor(private readonly log: LogOutputChannel) {}

  async execute(options: GitExecOptions): Promise<Result<GitExecResult>> {
    const { args, cwd, timeout = 30000, env, abortSignal } = options;
    const cmdString = `git ${args.join(' ')}`;

    if (abortSignal?.aborted) {
      this.log.debug(`Skipping aborted command: ${cmdString}`);
      return err(new GitError('Cancelled', 'CANCELLED', cmdString));
    }

    this.log.debug(`Executing: ${cmdString}`);
    const startTime = Date.now();

    const spawnEnv = env ? { ...process.env, ...env } : undefined;

    return new Promise((resolve) => {
      const gitProcess = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: spawnEnv,
      });

      let stdout = '';
      let stderr = '';
      let resolved = false;

      const onAbort = () => {
        gitProcess.kill();
        safeResolve(err(new GitError('Cancelled', 'CANCELLED', cmdString)));
      };

      const safeResolve = (result: Result<GitExecResult>) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve(result);
      };

      if (abortSignal) abortSignal.addEventListener('abort', onAbort, { once: true });

      const timeoutId = setTimeout(() => {
        gitProcess.kill();
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

      gitProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      gitProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      gitProcess.on('close',(code) => {
        const elapsed = Date.now() - startTime;
        if (code !== 0) {
          const stderrText = stderr.trim();
          const stdoutText = stdout.trim();
          const outputText = stderrText || stdoutText;
          this.log.info(`Git command exited with non-zero code: ${cmdString} — output: ${outputText}`);
          if (outputText.includes('not a git repository')) {
            safeResolve(
              err(
                new GitError(
                  'Not a git repository',
                  'NOT_A_REPOSITORY',
                  cmdString,
                  outputText
                )
              )
            );
          } else {
            safeResolve(
              err(
                new GitError(
                  outputText || `Git command failed with code ${code}`,
                  'COMMAND_FAILED',
                  cmdString,
                  outputText
                )
              )
            );
          }
        } else {
          this.log.debug(`Git command completed in ${elapsed}ms`);
          safeResolve(ok({ stdout, stderr }));
        }
      });

      gitProcess.on('error',(error) => {
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
