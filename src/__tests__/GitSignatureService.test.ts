import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitSignatureService } from '../services/GitSignatureService.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

const NUL = '\x00';

function buildSigOutput(parts: string[]): string {
  return parts.join(NUL);
}

describe('GitSignatureService.getSignatureInfo', () => {
  it('rejects invalid commit hashes', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const result = await service.getSignatureInfo('not-a-hash');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns null when status code is N (no signature)', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput(['N', '', '', '', '']), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBeNull();
  });

  it('parses good GPG signature', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['G', 'Eric Cheng <eric@x>', 'ABC123', 'FINGERPRINT', 'gpg: Signature made...']),
        stderr: '',
      },
    });

    const result = await service.getSignatureInfo('abc1234');
    expect(result.success).toBe(true);
    if (result.success && result.value) {
      expect(result.value.status).toBe('good');
      expect(result.value.signer).toBe('Eric Cheng <eric@x>');
      expect(result.value.keyId).toBe('ABC123');
      expect(result.value.fingerprint).toBe('FINGERPRINT');
      expect(result.value.format).toBe('gpg');
      expect(result.value.verificationUnavailable).toBe(false);
    }
  });

  it('parses bad GPG signature (status B)', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['B', 'Eric', 'KEYID', 'FP', 'gpg: BAD signature']),
        stderr: '',
      },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) {
      expect(result.value.status).toBe('bad');
    }
  });

  it.each([
    ['U', 'unknown'],
    ['X', 'unknown'],
    ['Y', 'unknown'],
    ['R', 'unknown'],
    ['E', 'unknown'],
  ])('maps status code %s to %s', async (code, expected) => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput([code, 's', 'k', 'f', '']), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) expect(result.value.status).toBe(expected);
  });

  it('detects ssh format from raw output', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['G', 'Eric', 'SHA256:abc', 'FP', 'Good "ssh-ed25519" signature']),
        stderr: '',
      },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) expect(result.value.format).toBe('ssh');
  });

  it('flags verificationUnavailable when raw output contains failure pattern', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['U', 's', 'k', 'f', "gpg: can't check signature: Missing GPG"]),
        stderr: '',
      },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) {
      expect(result.value.verificationUnavailable).toBe(true);
    }
  });
});
