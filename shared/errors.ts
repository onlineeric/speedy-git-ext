export type Result<T, E = GitError> =
  | { success: true; value: T }
  | { success: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

export class GitError extends Error {
  constructor(
    message: string,
    public readonly code: GitErrorCode,
    public readonly command?: string,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'GitError';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      command: this.command,
      stderr: this.stderr,
    };
  }
}

export type GitErrorCode =
  | 'NOT_A_REPOSITORY'
  | 'COMMAND_FAILED'
  | 'PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'UNKNOWN';
