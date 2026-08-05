import type { Commit, Branch, RefInfo, TagMetadata } from '../../shared/types.js';

const NULL_CHAR = '\x00';

export function isConflictStderr(stderr: string): boolean {
  return stderr.includes('CONFLICT') || stderr.toLowerCase().includes('merge conflict');
}

/**
 * The commit a stash was taken on top of, from a `%P` (parent hashes) field.
 *
 * A stash commit has two or three parents: the base commit, the index snapshot
 * and — with `-u` — the untracked snapshot. Only the first is real history; the
 * other two are stash internals that must never reach the graph. Both readers of
 * `git stash list` need this rule, so it lives here rather than twice inline.
 */
export function parseStashBaseHash(parentField: string): string {
  return parentField.trim().split(' ')[0];
}

export function parseCommitLine(line: string): Commit | null {
  const parts = line.split(NULL_CHAR);
  if (parts.length < 7) {
    return null;
  }

  const [hash, abbreviatedHash, parentStr, author, authorEmail, authorDateStr, subject, refsStr] = parts;

  const parents = parentStr ? parentStr.split(' ').filter(Boolean) : [];
  const authorDate = parseInt(authorDateStr, 10) * 1000;
  const refs = refsStr ? parseRefs(refsStr) : [];

  return {
    hash,
    abbreviatedHash,
    parents,
    author,
    authorEmail,
    authorDate,
    subject,
    refs,
  };
}

export function parseRefs(refsStr: string): RefInfo[] {
  if (!refsStr.trim()) {
    return [];
  }

  const refs: RefInfo[] = [];
  const refParts = refsStr.split(',').map((s) => s.trim());

  for (const part of refParts) {
    const refInfo = parseRefPart(part);
    if (refInfo) {
      refs.push(refInfo);
    }
  }

  return refs;
}

function parseRefPart(part: string): RefInfo | null {
  if (!part) {
    return null;
  }

  if (part.startsWith('HEAD -> ')) {
    return { name: stripPrefix(part.slice('HEAD -> '.length), 'refs/heads/'), type: 'head' };
  }

  if (part === 'HEAD') {
    return { name: 'HEAD', type: 'head' };
  }

  if (part.startsWith('tag: ')) {
    return { name: stripPrefix(part.slice('tag: '.length), 'refs/tags/'), type: 'tag' };
  }

  if (part.startsWith('refs/')) {
    return parseQualifiedRef(part);
  }

  // Stash shorthand (e.g. "stash@{0}") — `refs/stash` is handled by
  // parseQualifiedRef above. Stashes should not normally appear in %D
  // since they are excluded from log traversal, but handle defensively.
  if (part.startsWith('stash@{')) {
    return { name: part, type: 'stash' };
  }

  // Fallback for short-form decoration. We always ask git for `--decorate=full`,
  // so this only runs for refs that arrive unqualified, where `<a>/<b>` is genuinely
  // ambiguous. Prefer reading it as a local branch: a repo is far more likely to have
  // `team/feature` branches than a remote whose name collides with a branch prefix.
  const commonRemotes = ['origin', 'upstream', 'fork'];
  const slashIndex = part.indexOf('/');

  if (slashIndex > 0) {
    const potentialRemote = part.slice(0, slashIndex);
    if (commonRemotes.includes(potentialRemote)) {
      const branchName = part.slice(slashIndex + 1);
      // Skip `<remote>/HEAD` — it's git's symbolic ref recording the remote's default
      // branch, not a real branch. Surfacing it as a branch led to actions like
      // `git fetch origin HEAD:HEAD` creating a stray local `refs/heads/HEAD`.
      if (branchName === 'HEAD') return null;
      return { name: branchName, type: 'remote', remote: potentialRemote };
    }
  }

  // Local branch (may contain slashes like "feature/login")
  return { name: part, type: 'branch' };
}

/** Removes `prefix` from `value` when present, otherwise returns it unchanged. */
function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function parseQualifiedRef(refName: string): RefInfo | null {
  if (refName.startsWith('refs/heads/')) {
    return { name: refName.slice('refs/heads/'.length), type: 'branch' };
  }

  if (refName.startsWith('refs/remotes/')) {
    const remoteRef = refName.slice('refs/remotes/'.length);
    const slashIndex = remoteRef.indexOf('/');
    if (slashIndex <= 0) return null;

    const remote = remoteRef.slice(0, slashIndex);
    const branchName = remoteRef.slice(slashIndex + 1);
    if (!branchName || branchName === 'HEAD') return null;

    return { name: branchName, type: 'remote', remote };
  }

  if (refName.startsWith('refs/tags/')) {
    return { name: refName.slice('refs/tags/'.length), type: 'tag' };
  }

  if (refName === 'refs/stash') {
    return { name: refName, type: 'stash' };
  }

  return null;
}

/**
 * Display name for one line of `git branch --format=%(refname)` output.
 *
 * The qualified form is what makes this unambiguous: `%(refname:short)` prints
 * `team/feature` for both a local branch of that name and the branch `feature`
 * on a remote named `team`. Local branches keep their full name (a branch
 * literally called `release/HEAD` survives); remote-tracking branches render as
 * `<remote>/<branch>`; `<remote>/HEAD`, tags and non-ref lines (the
 * `(HEAD detached at …)` pseudo-entry) are dropped.
 */
export function parseBranchRefName(refName: string): string | null {
  const ref = parseQualifiedRef(refName.trim());
  if (!ref) return null;
  if (ref.type === 'branch') return ref.name;
  if (ref.type === 'remote') return `${ref.remote}/${ref.name}`;
  return null;
}

/**
 * Parse `git for-each-ref refs/tags` output using the null-byte field format:
 *   `%(refname:short)%00%(objecttype)%00%(contents)%00%(taggername)%00%(taggerdate:unix)%00`
 * `%(contents)` can contain newlines, so records are parsed as fixed-width NUL
 * field groups instead of splitting on line breaks.
 * Lightweight tags (`objecttype !== 'tag'`) carry no annotation fields.
 */
export function parseTagMetadata(stdout: string): TagMetadata[] {
  const metadata: TagMetadata[] = [];
  const fields = stdout.split(NULL_CHAR);

  for (let index = 0; index + 4 < fields.length; index += 5) {
    // Records are joined with '\n', so every field after the first record's name
    // carries a leading newline; tag names contain no whitespace, so trim() is safe.
    const name = fields[index].trim();
    const objectType = fields[index + 1];
    // Strip only trailing line breaks from %(contents) to preserve internal blank
    // lines and any leading indentation in the annotation body.
    const message = fields[index + 2].replace(/[\r\n]+$/, '');
    const taggerName = fields[index + 3];
    const taggerDate = fields[index + 4];
    if (!name) continue;

    const annotated = objectType === 'tag';
    if (!annotated) {
      metadata.push({ name, annotated: false });
      continue;
    }

    const date = taggerDate ? parseInt(taggerDate, 10) : NaN;
    metadata.push({
      name,
      annotated: true,
      message: message ? message : undefined,
      tagger: taggerName ? taggerName : undefined,
      date: Number.isNaN(date) ? undefined : date,
    });
  }

  return metadata;
}

export function parseBranchLine(line: string): Branch | null {
  // Format: refname\x00HEAD_marker\x00hash
  const parts = line.split(NULL_CHAR);
  if (parts.length !== 3) {
    return null;
  }

  const [rawName, headMarker, hash] = parts;
  const trimmedName = rawName.trim();
  const isCurrent = headMarker === '*';

  // The caller asks for `%(refname)`, so every real branch arrives fully qualified.
  // That matters: with the short form, `test/branch1` is indistinguishable from the
  // branch `branch1` on a remote named `test`, and guessing between them made local
  // branches with a slash in the name masquerade as remote branches — which in turn
  // hid the fact that one of them was the checked-out branch.
  if (trimmedName.startsWith('refs/')) {
    // parseQualifiedRef owns the ref grammar, including dropping `<remote>/HEAD`
    // (a symbolic ref for the remote's default branch, not a branch to act on).
    const ref = parseQualifiedRef(trimmedName);
    if (ref?.type !== 'branch' && ref?.type !== 'remote') return null;

    return {
      name: ref.name,
      remote: ref.type === 'remote' ? ref.remote : undefined,
      current: isCurrent,
      hash: hash.trim(),
    };
  }

  // Detached HEAD is reported as a pseudo-entry rather than a ref — literally
  // "(HEAD detached at abc1234)". It isn't a branch, but it is how the rest of the
  // app learns that HEAD is here, so it is passed through as-is rather than dropped.
  return {
    name: trimmedName,
    remote: undefined,
    current: isCurrent,
    hash: hash.trim(),
  };
}
