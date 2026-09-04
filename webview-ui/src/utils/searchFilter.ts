import type { Commit } from '@shared/types';
import { UNCOMMITTED_HASH } from '@shared/types';
import type { DisplayRef } from '../types/displayRefs';
import { filterDisplayRefsBySettings, mergeRefs } from './mergeRefs';
import { getRefBadgeContent } from './refBadgeContent';
import type { SearchTerm } from './searchQuery';

/**
 * Which commits a search matches.
 *
 * **All terms must match; each term may match any field.** Two terms may land on
 * the same field, so `fix login` finds "fix the login bug" as readily as
 * `john fix` finds a commit by John about a fix.
 *
 * Every rule below is evaluated **per term**, not per query — in `fix a1b2c3d`,
 * only `a1b2c3d` is hash-eligible.
 */

/** The View settings that decide which ref badges a row shows, and therefore what can match. */
export interface SearchSettings {
  showTags: boolean;
  showRemoteBranches: boolean;
}

/** Lower-cased, pre-extracted haystacks for one commit. */
export interface CommitSearchFields {
  subject: string;
  author: string;
  authorEmail: string;
  hash: string;
  abbreviatedHash: string;
  /** Every ref text the row can match on — badge labels, plus a merged badge's qualified remote names. */
  refTexts: string[];
}

/**
 * Git's own floor for resolving an abbreviated hash. Below it, short hex-ish
 * words (`add`, `face`, `beef`) would light up unrelated commits.
 */
export const MIN_HASH_TERM_LENGTH = 4;

/**
 * `mergeRefs` output cached by commit identity. A `Commit` is immutable and is
 * replaced wholesale on reload, so the cache can never go stale. The **settings
 * filter is applied after the cache**, so toggling Show tags invalidates nothing.
 */
const mergedRefsCache = new WeakMap<Commit, DisplayRef[]>();

function mergedDisplayRefs(commit: Commit): DisplayRef[] {
  const cached = mergedRefsCache.get(commit);
  if (cached) return cached;
  const displayRefs = mergeRefs(commit.refs).displayRefs;
  mergedRefsCache.set(commit, displayRefs);
  return displayRefs;
}

/**
 * Every text a rendered badge contributes, read from the badge's own content so
 * the matcher cannot disagree with what `RefLabel` draws. A remote badge's label
 * is already `origin/main`, so the bare form is free via substring matching, and
 * `hiddenSearchTexts` carries the one accepted "matched with nothing visible"
 * case — a merged branch's qualified remote names, marked in the UI by a ring on
 * the badge rather than an inline highlight.
 */
function refTextsFor(displayRef: DisplayRef): string[] {
  const { label, hiddenSearchTexts } = getRefBadgeContent(displayRef);
  return hiddenSearchTexts.length > 0 ? [label, ...hiddenSearchTexts] : [label];
}

/**
 * The five settings-independent haystacks, cached by commit identity for the same
 * reason `mergedRefsCache` is: a `Commit` is immutable and replaced wholesale.
 *
 * Without it every debounced keystroke re-lowercases every loaded commit's five
 * fields — tens of thousands of byte-identical strings per recompute once a few
 * batches are loaded, when only `commitMatchesTerms` actually depends on the query.
 */
const commitTextCache = new WeakMap<Commit, Omit<CommitSearchFields, 'refTexts'>>();

function commitTextFields(commit: Commit): Omit<CommitSearchFields, 'refTexts'> {
  const cached = commitTextCache.get(commit);
  if (cached) return cached;
  const fields = {
    subject: (commit.subject ?? '').toLowerCase(),
    author: (commit.author ?? '').toLowerCase(),
    authorEmail: (commit.authorEmail ?? '').toLowerCase(),
    hash: (commit.hash ?? '').toLowerCase(),
    abbreviatedHash: (commit.abbreviatedHash ?? '').toLowerCase(),
  };
  commitTextCache.set(commit, fields);
  return fields;
}

/**
 * Pre-extracts one commit's haystacks, or `null` for a commit that can never
 * match — the uncommitted row alone, whose subject is generated text like
 * "3 staged, 2 unstaged" that a search for `staged` should not surface. Stash
 * pseudo-commits are ordinary participants.
 *
 * Only `refTexts` is rebuilt per call: it is the one field the View settings can
 * change, so caching it would have to be invalidated on a Show tags toggle.
 */
export function buildCommitSearchFields(commit: Commit, settings: SearchSettings): CommitSearchFields | null {
  if (commit.hash === UNCOMMITTED_HASH) return null;

  const displayRefs = filterDisplayRefsBySettings(mergedDisplayRefs(commit), settings);

  return {
    ...commitTextFields(commit),
    refTexts: displayRefs.flatMap(refTextsFor).map((text) => text.toLowerCase()),
  };
}

/** True when **every** term matches this commit somewhere. */
export function commitMatchesTerms(fields: CommitSearchFields, terms: readonly SearchTerm[]): boolean {
  return terms.every(({ text }) =>
    fields.subject.includes(text)
    || fields.author.includes(text)
    || fields.authorEmail.includes(text)
    || (text.length >= MIN_HASH_TERM_LENGTH
      && (fields.hash.startsWith(text) || fields.abbreviatedHash.startsWith(text)))
    || fields.refTexts.some((refText) => refText.includes(text)),
  );
}

/**
 * Row indices of the matching commits, in ascending order.
 *
 * Takes **parsed terms**, not a raw string: the parse belongs to the caller so the
 * panel's "N of M" and the rows' highlights are guaranteed to describe the same
 * query. An empty term list matches nothing, preserving the empty-query behaviour.
 */
export function filterCommits(
  commits: Commit[],
  terms: readonly SearchTerm[],
  settings: SearchSettings,
): number[] {
  if (terms.length === 0) return [];

  const matches: number[] = [];
  for (let index = 0; index < commits.length; index++) {
    const fields = buildCommitSearchFields(commits[index], settings);
    if (fields && commitMatchesTerms(fields, terms)) {
      matches.push(index);
    }
  }
  return matches;
}
