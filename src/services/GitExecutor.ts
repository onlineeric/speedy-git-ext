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
  /** Optional data to write to the process's stdin (then closed). Used by
   *  `git cat-file --batch`, which reads object names from stdin
   *  (047-signing-verification). */
  stdin?: string;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export interface GitExecRawResult {
  /** Raw, undecoded stdout bytes — required for byte-accurate parsing of
   *  `git cat-file --batch` output, whose object sizes are byte counts. */
  stdout: Buffer;
  stderr: string;
}

export class GitExecutor {
  constructor(private readonly log: LogOutputChannel) {}

  async execute(options: GitExecOptions): Promise<Result<GitExecResult>> {
    const result = await this.run(options);
    if (!result.success) return result;
    return ok({ stdout: result.value.stdout.toString(), stderr: result.value.stderr });
  }

  /** Like {@link execute} but resolves with raw stdout bytes (no UTF-8 decode),
   *  so callers can slice by byte offset (e.g. `git cat-file --batch`). */
  async executeRaw(options: GitExecOptions): Promise<Result<GitExecRawResult>> {
    return this.run(options);
  }

  private async run(options: GitExecOptions): Promise<Result<GitExecRawResult>> {
    const { args, cwd, timeout = 30000, env, abortSignal, stdin } = options;
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

      const stdoutChunks: Buffer[] = [];
      let stderr = '';
      let resolved = false;

      const onAbort = () => {
        gitProcess.kill();
        safeResolve(err(new GitError('Cancelled', 'CANCELLED', cmdString)));
      };

      const safeResolve = (result: Result<GitExecRawResult>) => {
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
        stdoutChunks.push(data);
      });

      gitProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      gitProcess.on('close',(code) => {
        const elapsed = Date.now() - startTime;
        const stdout = Buffer.concat(stdoutChunks);
        if (code !== 0) {
          const stderrText = stderr.trim();
          const stdoutText = stdout.toString().trim();
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

      if (stdin !== undefined) {
        gitProcess.stdin?.write(stdin);
        gitProcess.stdin?.end();
      }
    });
  }
}
