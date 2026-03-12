import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type { CommitSignatureInfo, SignatureFormat, SignatureStatus } from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';

const NULL_CHAR = '\x00';
const RAW_SIGNATURE_UNAVAILABLE_PATTERNS = [
  'gpg failed to sign the data',
  'no signature found',
  'gpg: can\'t check signature',
  'missing gpg',
  'ssh signature verification unavailable',
];

export class GitSignatureService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  async getSignatureInfo(hash: string): Promise<Result<CommitSignatureInfo | null>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    const result = await this.executor.execute({
      args: ['log', '-1', '--format=%G?%x00%GS%x00%GK%x00%GP%x00%GG', hash],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const signature = this.parseSignatureOutput(result.value.stdout);
    return ok(signature);
  }

  private parseSignatureOutput(stdout: string): CommitSignatureInfo | null {
    const trimmed = stdout.replace(/\n$/, '');
    const separators: number[] = [];
    for (let i = 0; i < trimmed.length && separators.length < 4; i++) {
      if (trimmed[i] === NULL_CHAR) separators.push(i);
    }

    const getSlice = (index: number) => {
      const start = index === 0 ? 0 : separators[index - 1] + 1;
      const end = index < separators.length ? separators[index] : trimmed.length;
      return trimmed.slice(start, end);
    };

    const statusCode = getSlice(0).trim();
    const signer = getSlice(1).trim();
    const keyId = getSlice(2).trim();
    const fingerprint = getSlice(3).trim();
    const rawOutput = separators.length === 4 ? trimmed.slice(separators[3] + 1).trim() : '';

    const status = this.mapSignatureStatus(statusCode);
    if (status === 'none') {
      return null;
    }

    return {
      status,
      signer,
      keyId,
      fingerprint,
      format: this.detectSignatureFormat(rawOutput),
      verificationUnavailable: this.isVerificationUnavailable(rawOutput),
    };
  }

  private mapSignatureStatus(statusCode: string): SignatureStatus {
    switch (statusCode) {
      case 'G':
        return 'good';
      case 'B':
        return 'bad';
      case 'U':
      case 'X':
      case 'Y':
      case 'R':
      case 'E':
        return 'unknown';
      default:
        return 'none';
    }
  }

  private detectSignatureFormat(rawOutput: string): SignatureFormat {
    if (rawOutput.includes('ssh-')) {
      return 'ssh';
    }
    return 'gpg';
  }

  private isVerificationUnavailable(rawOutput: string): boolean {
    const normalized = rawOutput.toLowerCase();
    return RAW_SIGNATURE_UNAVAILABLE_PATTERNS.some((pattern) => normalized.includes(pattern));
  }
}
