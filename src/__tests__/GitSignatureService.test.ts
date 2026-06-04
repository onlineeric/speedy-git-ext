import type { LogOutputChannel } from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import { GitSignatureService } from '../services/GitSignatureService.js';
import { GitError } from '../../shared/errors.js';

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LogOutputChannel;

const NUL = '\x00';

function buildSigOutput(parts: string[]): string {
  return parts.join(NUL);
}

/** Build a single `git cat-file --batch` record: `<oid> commit <size>\n<content>\n`. */
function batchRecord(oid: string, content: string): Buffer {
  const contentBuf = Buffer.from(content, 'utf8');
  const header = Buffer.from(`${oid} commit ${contentBuf.length}\n`, 'utf8');
  return Buffer.concat([header, contentBuf, Buffer.from('\n', 'utf8')]);
}

const SIGNED_COMMIT = [
  'tree 1111111111111111111111111111111111111111',
  'parent 2222222222222222222222222222222222222222',
  'author A <a@x> 1700000000 +0000',
  'committer C <c@x> 1700000000 +0000',
  'gpgsig -----BEGIN SSH SIGNATURE-----',
  ' AAAA',
  ' -----END SSH SIGNATURE-----',
  '',
  'a signed commit message',
  '',
].join('\n');

const GPG_SIGNED_COMMIT = [
  'tree 1111111111111111111111111111111111111111',
  'parent 2222222222222222222222222222222222222222',
  'author A <a@x> 1700000000 +0000',
  'committer C <c@x> 1700000000 +0000',
  'gpgsig -----BEGIN PGP SIGNATURE-----',
  ' AAAA',
  ' -----END PGP SIGNATURE-----',
  '',
  'a gpg-signed commit message',
  '',
].join('\n');

const UNSIGNED_COMMIT = [
  'tree 1111111111111111111111111111111111111111',
  'parent 2222222222222222222222222222222222222222',
  'author A <a@x> 1700000000 +0000',
  'committer C <c@x> 1700000000 +0000',
  '',
  'an unsigned commit message',
  '',
].join('\n');

describe('GitSignatureService.getSignatureInfo', () => {
  it('rejects invalid commit hashes', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const result = await service.getSignatureInfo('not-a-hash');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns null for an unsigned commit (N verdict, no signature header)', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput(['N', '', '', '']), stderr: '' },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', UNSIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toBeNull();
  });

  it('maps a good GPG signature to verified', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['G', 'Eric Cheng <eric@x>', 'ABC123', 'FINGERPRINT']),
        stderr: '',
      },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', GPG_SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    expect(result.success).toBe(true);
    if (result.success && result.value) {
      expect(result.value.status).toBe('verified');
      expect(result.value.signer).toBe('Eric Cheng <eric@x>');
      expect(result.value.keyId).toBe('ABC123');
      expect(result.value.fingerprint).toBe('FINGERPRINT');
      expect(result.value.format).toBe('gpg');
    }
  });

  it('maps a bad signature (B) to bad', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput(['B', 'Eric', 'KEYID', 'FP']), stderr: '' },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', GPG_SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) expect(result.value.status).toBe('bad');
  });

  it.each([
    ['U', 'signed-not-trusted'],
    ['E', 'signed-key-missing'],
    ['X', 'signed-not-good'],
    ['Y', 'signed-not-good'],
    ['R', 'signed-not-good'],
  ])('maps verdict %s to %s', async (code, expected) => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput([code, 's', 'k', 'f']), stderr: '' },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', GPG_SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) expect(result.value.status).toBe(expected);
  });

  // Real SSH verification output (`%GG`) carries no `ssh-` token, so format must
  // come from the `gpgsig` header's `-----BEGIN SSH SIGNATURE-----` marker.
  it('detects ssh format from the gpgsig header', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: {
        stdout: buildSigOutput(['G', 'Eric', 'SHA256:abc', 'FP']),
        stderr: '',
      },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    if (result.success && result.value) expect(result.value.format).toBe('ssh');
  });

  // FR-017 regression: a present signature with no verdict (SSH, no allowedSignersFile)
  // must read as `unavailable`, never `unsigned`.
  it('maps a present-but-unverifiable signature (N verdict + gpgsig header) to unavailable', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput(['N', '', '', '']), stderr: '' },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('abc1234', SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.getSignatureInfo('abc1234');
    expect(result.success).toBe(true);
    if (result.success && result.value) expect(result.value.status).toBe('unavailable');
  });
});

describe('GitSignatureService.detectPresence', () => {
  it('returns signed for a gpgsig-carrying commit and not-signed otherwise', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: {
        stdout: Buffer.concat([
          batchRecord('aaaaaaa', SIGNED_COMMIT),
          batchRecord('bbbbbbb', UNSIGNED_COMMIT),
        ]),
        stderr: '',
      },
    });

    const result = await service.detectPresence(['aaaaaaa', 'bbbbbbb']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value['aaaaaaa']).toBe('signed');
      expect(result.value['bbbbbbb']).toBe('not-signed');
    }
  });

  it('does not let a signed commit body cause a false positive', async () => {
    // The body mentions "gpgsig" but it lives after the blank line, so presence
    // must still be not-signed.
    const service = new GitSignatureService('/repo', mockLog);
    const bodyMentionsGpgsig = [
      'tree 1111111111111111111111111111111111111111',
      'author A <a@x> 1700000000 +0000',
      'committer C <c@x> 1700000000 +0000',
      '',
      'gpgsig is discussed in this commit message',
      '',
    ].join('\n');
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('ccccccc', bodyMentionsGpgsig), stderr: '' },
    });

    const result = await service.detectPresence(['ccccccc']);
    if (result.success) expect(result.value['ccccccc']).toBe('not-signed');
  });

  it('returns an empty map for no hashes without spawning git', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'executeRaw');
    const result = await service.detectPresence([]);
    expect(result.success).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips invalid object ids (e.g. the synthetic UNCOMMITTED row) instead of failing the batch', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('aaaaaaa', SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.detectPresence(['aaaaaaa', 'UNCOMMITTED']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value['aaaaaaa']).toBe('signed');
      expect(result.value['UNCOMMITTED']).toBeUndefined();
    }
    // Only the valid hash is ever handed to git.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].stdin).toBe('aaaaaaa\n');
  });

  it('does not spawn git when every hash is invalid', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const spy = vi.spyOn(service['executor'], 'executeRaw');
    const result = await service.detectPresence(['UNCOMMITTED']);
    expect(result.success).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GitSignatureService.verifySignatures', () => {
  it('maps each verdict to the 7-state enum, preserving input order', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    const verdicts: Record<string, string> = {
      aaaaaaa: 'G',
      bbbbbbb: 'B',
      ccccccc: 'N', // present (caller-vetted) but no verdict → unavailable
    };
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const hash = opts.args[opts.args.length - 1];
      return {
        success: true,
        value: { stdout: buildSigOutput([verdicts[hash] ?? 'N', '', '', '']), stderr: '' },
      };
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: {
        stdout: Buffer.concat([
          batchRecord('aaaaaaa', GPG_SIGNED_COMMIT),
          batchRecord('bbbbbbb', GPG_SIGNED_COMMIT),
          batchRecord('ccccccc', SIGNED_COMMIT),
        ]),
        stderr: '',
      },
    });

    const result = await service.verifySignatures(['aaaaaaa', 'bbbbbbb', 'ccccccc']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value['aaaaaaa']?.status).toBe('verified');
      expect(result.value['bbbbbbb']?.status).toBe('bad');
      expect(result.value['ccccccc']?.status).toBe('unavailable');
      expect(Object.keys(result.value)).toEqual(['aaaaaaa', 'bbbbbbb', 'ccccccc']);
    }
  });

  it('skips invalid object ids without aborting the batch', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockResolvedValue({
      success: true,
      value: { stdout: buildSigOutput(['G', '', '', '']), stderr: '' },
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: { stdout: batchRecord('aaaaaaa', GPG_SIGNED_COMMIT), stderr: '' },
    });

    const result = await service.verifySignatures(['aaaaaaa', 'UNCOMMITTED']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value['aaaaaaa']?.status).toBe('verified');
      expect(result.value['UNCOMMITTED']).toBeUndefined();
    }
  });

  it('skips a commit whose verdict lookup fails, keeping the rest of the batch', async () => {
    const service = new GitSignatureService('/repo', mockLog);
    vi.spyOn(service['executor'], 'execute').mockImplementation(async (opts) => {
      const hash = opts.args[opts.args.length - 1];
      if (hash === 'bbbbbbb') {
        return { success: false, error: new GitError('verdict boom', 'COMMAND_FAILED') };
      }
      return { success: true, value: { stdout: buildSigOutput(['G', '', '', '']), stderr: '' } };
    });
    vi.spyOn(service['executor'], 'executeRaw').mockResolvedValue({
      success: true,
      value: {
        stdout: Buffer.concat([
          batchRecord('aaaaaaa', GPG_SIGNED_COMMIT),
          batchRecord('bbbbbbb', GPG_SIGNED_COMMIT),
        ]),
        stderr: '',
      },
    });

    const result = await service.verifySignatures(['aaaaaaa', 'bbbbbbb']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value['aaaaaaa']?.status).toBe('verified');
      expect(result.value['bbbbbbb']).toBeUndefined();
    }
  });
});
