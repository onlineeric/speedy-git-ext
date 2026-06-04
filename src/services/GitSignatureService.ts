import type { LogOutputChannel } from 'vscode';
import { GitExecutor } from './GitExecutor.js';
import { type Result, ok } from '../../shared/errors.js';
import type {
  CommitSignatureInfo,
  SignatureFormat,
  SignaturePresence,
  SignatureStatus,
} from '../../shared/types.js';
import { validateHash } from '../utils/gitValidation.js';

const NULL_CHAR = '\x00';
const LF = 0x0a;

/** Raw fields extracted from git's `%G?`-driven verification output. */
interface SignatureVerdict {
  statusCode: string;
  signer: string;
  keyId: string;
  fingerprint: string;
}

/** Per-commit signature facts read straight from the commit object header. */
interface ObjectSignature {
  presence: SignaturePresence;
  /** Detected from the `gpgsig` header marker; null when the commit is unsigned. */
  format: SignatureFormat | null;
}

/** git log placeholders for the verification verdict (status, signer, key, fingerprint). */
const VERDICT_FORMAT = '%G?%x00%GS%x00%GK%x00%GP';

export class GitSignatureService {
  private executor: GitExecutor;

  constructor(
    private readonly workspacePath: string,
    private readonly log: LogOutputChannel
  ) {
    this.executor = new GitExecutor(log);
  }

  // ── Single commit (details panel) ──────────────────────────────────

  async getSignatureInfo(hash: string): Promise<Result<CommitSignatureInfo | null>> {
    const hashCheck = validateHash(hash);
    if (!hashCheck.success) return hashCheck;

    this.log.info(`Get signature info for ${hash.slice(0, 7)}`);
    // The verdict (`git log %G?`) and the object inspection (`git cat-file`) are
    // independent reads of the same hash, so run them concurrently. The `gpgsig`
    // header is the authoritative source for both presence (FR-017) and format:
    // `%G?`/`%GG` under-report SSH signatures (which read as `unavailable` with no
    // format token when no `allowedSignersFile` exists).
    const [verdictResult, objectResult] = await Promise.all([
      this.fetchVerdict(hash),
      this.inspectObjects([hash]),
    ]);
    if (!verdictResult.success) return verdictResult;
    if (!objectResult.success) return objectResult;

    const { verdict, definiteStatus } = verdictResult.value;
    const object = objectResult.value[hash];
    const format = object?.format ?? 'gpg';

    // A definite verdict (G/B/U/E/X/Y/R) implies the signature is present.
    if (definiteStatus) {
      return ok(this.buildInfo(definiteStatus, verdict, format));
    }

    // No verdict (N/error): presence is the source of truth (FR-017). A present
    // signature reads as `unavailable`; a truly unsigned commit yields null.
    if (object?.presence === 'signed') {
      return ok(this.buildInfo('unavailable', verdict, format));
    }
    return ok(null);
  }

  // ── Batch: cheap presence detection (no crypto) ────────────────────

  /**
   * Resolve signature presence for many commits in a single `git cat-file --batch`
   * process by scanning each commit object's header block for a `gpgsig` line
   * (research R1). No cryptographic verification, configuration-independent.
   */
  async detectPresence(hashes: string[]): Promise<Result<Record<string, SignaturePresence>>> {
    this.log.info(`Detect signature presence for ${hashes.length} commit(s)`);
    const result = await this.inspectObjects(hashes);
    if (!result.success) return result;

    const presence: Record<string, SignaturePresence> = {};
    for (const [oid, info] of Object.entries(result.value)) {
      presence[oid] = info.presence;
    }
    return ok(presence);
  }

  /**
   * Read signature presence AND format for many commits in a single
   * `git cat-file --batch` pass (research R1). For each commit object we scan the
   * header block for a `gpgsig` line; its `-----BEGIN …-----` marker is the
   * authoritative format signal. No cryptographic verification, configuration-
   * independent.
   */
  private async inspectObjects(hashes: string[]): Promise<Result<Record<string, ObjectSignature>>> {
    const objects: Record<string, ObjectSignature> = {};

    // Drop anything that isn't a valid object id (e.g. the synthetic `UNCOMMITTED`
    // / stash rows): one bad hash would otherwise fail `git cat-file --batch` and
    // blank the entire viewport batch. Unknown-but-valid hashes need no guard —
    // git reports them as "<oid> missing" and we treat them as unsigned.
    const validHashes = hashes.filter((hash) => validateHash(hash).success);
    if (validHashes.length === 0) return ok(objects);

    const result = await this.executor.executeRaw({
      args: ['cat-file', '--batch'],
      cwd: this.workspacePath,
      stdin: validHashes.join('\n') + '\n',
    });
    if (!result.success) return result;

    this.parseBatchObjects(result.value.stdout, objects);
    return ok(objects);
  }

  // ── Batch: verification verdict (signed commits only) ──────────────

  /**
   * Verify many commits already known to be signed (presence pass done by the
   * caller). Returns a hash→info map. A present-but-unverifiable signature maps
   * to `unavailable`, never `unsigned` (FR-017).
   */
  async verifySignatures(hashes: string[]): Promise<Result<Record<string, CommitSignatureInfo | null>>> {
    const results: Record<string, CommitSignatureInfo | null> = {};
    if (hashes.length === 0) return ok(results);

    this.log.info(`Verify signatures for ${hashes.length} commit(s)`);
    // One batch pass yields the authoritative format for every hash (and validates
    // them up front); the per-hash `git log` below only provides the verdict.
    const objectResult = await this.inspectObjects(hashes);
    if (!objectResult.success) return objectResult;

    for (const hash of hashes) {
      // Skip non-object ids defensively; one bad hash must not abort the batch.
      if (!validateHash(hash).success) continue;

      const verdictResult = await this.fetchVerdict(hash);
      if (!verdictResult.success) {
        // A single unverifiable commit shouldn't blank every other glyph — log
        // and move on, leaving this hash absent from the result map.
        this.log.warn(`Skip signature verdict for ${hash.slice(0, 7)}: ${verdictResult.error.message}`);
        continue;
      }

      const { verdict, definiteStatus } = verdictResult.value;
      const format = objectResult.value[hash]?.format ?? 'gpg';
      // These hashes are known signed, so any non-verdict resolves to `unavailable`.
      results[hash] = this.buildInfo(definiteStatus ?? 'unavailable', verdict, format);
    }

    return ok(results);
  }

  // ── Parsing helpers ────────────────────────────────────────────────

  /**
   * Run git's verification placeholders for one commit and map the `%G?` code to
   * a definite status (or `null` when there's no verdict). Shared by the single-
   * commit and batch paths.
   */
  private async fetchVerdict(
    hash: string
  ): Promise<Result<{ verdict: SignatureVerdict; definiteStatus: SignatureStatus | null }>> {
    const result = await this.executor.execute({
      args: ['log', '-1', `--format=${VERDICT_FORMAT}`, hash],
      cwd: this.workspacePath,
    });
    if (!result.success) return result;

    const verdict = this.parseVerdict(result.value.stdout);
    return ok({ verdict, definiteStatus: this.statusFromVerdictCode(verdict.statusCode) });
  }

  private parseVerdict(stdout: string): SignatureVerdict {
    const trimmed = stdout.replace(/\n$/, '');
    const separators: number[] = [];
    for (let i = 0; i < trimmed.length && separators.length < 3; i++) {
      if (trimmed[i] === NULL_CHAR) separators.push(i);
    }

    const getSlice = (index: number) => {
      const start = index === 0 ? 0 : separators[index - 1] + 1;
      const end = index < separators.length ? separators[index] : trimmed.length;
      return trimmed.slice(start, end);
    };

    return {
      statusCode: getSlice(0).trim(),
      signer: getSlice(1).trim(),
      keyId: getSlice(2).trim(),
      fingerprint: getSlice(3).trim(),
    };
  }

  /**
   * Map a `%G?` code to a definite signature status, or `null` for `N`/unknown
   * codes (which require presence detection to distinguish `unavailable` from
   * `unsigned`).
   */
  private statusFromVerdictCode(statusCode: string): SignatureStatus | null {
    switch (statusCode) {
      case 'G':
        return 'verified';
      case 'B':
        return 'bad';
      case 'U':
        return 'signed-not-trusted';
      case 'E':
        return 'signed-key-missing';
      case 'X':
      case 'Y':
      case 'R':
        return 'signed-not-good';
      default:
        return null;
    }
  }

  private buildInfo(
    status: SignatureStatus,
    verdict: SignatureVerdict,
    format: SignatureFormat
  ): CommitSignatureInfo {
    return {
      status,
      signer: verdict.signer,
      keyId: verdict.keyId,
      fingerprint: verdict.fingerprint,
      format,
    };
  }

  /**
   * Map a `gpgsig` header line to a signature format. The mechanism is named by
   * the PEM marker on that line, e.g. `gpgsig -----BEGIN SSH SIGNATURE-----`.
   * OpenPGP (`PGP SIGNATURE`) and X.509/gpgsm (`SIGNED MESSAGE`) both fall under
   * `gpg` per spec; only SSH is reported distinctly.
   */
  private formatFromSignatureHeader(gpgsigLine: string): SignatureFormat {
    return gpgsigLine.includes('SSH SIGNATURE') ? 'ssh' : 'gpg';
  }

  /**
   * Walk `git cat-file --batch` output by byte offset (object sizes are byte
   * counts). For each commit object, scan the header block — everything before
   * the first blank line — for a `gpgsig`/`gpgsig-sha256` line. The body comes
   * after the blank line and is never scanned, so it can't cause false positives.
   */
  private parseBatchObjects(stdout: Buffer, objects: Record<string, ObjectSignature>): void {
    let offset = 0;
    while (offset < stdout.length) {
      const infoEnd = stdout.indexOf(LF, offset);
      if (infoEnd === -1) break;

      const infoLine = stdout.toString('utf8', offset, infoEnd);
      offset = infoEnd + 1;

      const parts = infoLine.split(' ');
      const oid = parts[0];
      // Missing/invalid objects: "<oid> missing" with no following content.
      if (parts[1] === 'missing' || parts.length < 3) {
        if (oid) objects[oid] = { presence: 'not-signed', format: null };
        continue;
      }

      const size = parseInt(parts[2], 10);
      if (!Number.isFinite(size)) break;

      const contentEnd = offset + size;
      const headerBlock = stdout.toString('utf8', offset, contentEnd);
      const blankLineIndex = headerBlock.indexOf('\n\n');
      const headers = blankLineIndex === -1 ? headerBlock : headerBlock.slice(0, blankLineIndex);
      const gpgsigLine = headers.split('\n').find((line) => line.startsWith('gpgsig'));
      objects[oid] = gpgsigLine
        ? { presence: 'signed', format: this.formatFromSignatureHeader(gpgsigLine) }
        : { presence: 'not-signed', format: null };

      offset = contentEnd + 1; // skip the content bytes and the trailing LF
    }
  }
}
