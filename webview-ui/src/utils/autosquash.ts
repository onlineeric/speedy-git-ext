import type { RebaseEntry, RebaseRangeCommit } from '@shared/types';
import { MIN_HASH_TERM_LENGTH } from './searchFilter';

/**
 * Git's autosquash rules, stated once for both rebase dialogs.
 *
 * Ported from `todo_list_rearrange_squash` in git's `sequencer.c` rather than
 * re-invented, so what the dialogs predict is what git does:
 *
 * - A commit is autosquashable when its subject starts with `fixup! `,
 *   `squash! ` or `amend! `. Repeated prefixes (`fixup! squash! X`) are skipped
 *   to reach the target text; the **outermost** prefix decides the kind.
 * - The target is looked up among **earlier** commits only: an exact subject
 *   match (first occurrence wins); else, when the text is 4+ hex digits, a
 *   commit whose hash starts with it; else the first commit whose subject
 *   starts with the text.
 * - A matched autosquash commit is no longer a subject target itself, but it can
 *   still be reached by hash or subject prefix, which is how chains attach.
 */

export type AutosquashKind = 'fixup' | 'squash' | 'amend';

export interface AutosquashLink {
  /** The `fixup!` / `squash!` / `amend!` commit. */
  hash: string;
  /** The commit it is squashed into, earlier in the list. */
  targetHash: string;
  kind: AutosquashKind;
}

export interface AutosquashAnalysis {
  /** In list order, which is the order git links them. */
  links: AutosquashLink[];
  /** Autosquashable commits whose target is not in the list: they will not be applied. */
  unmatched: string[];
  /** Target texts matched by subject while 2+ commits fit that match: git may pick the wrong one. */
  ambiguousSubjects: string[];
}

const PREFIXES: ReadonlyArray<readonly [string, AutosquashKind]> = [
  ['fixup! ', 'fixup'],
  ['squash! ', 'squash'],
  ['amend! ', 'amend'],
];

/** Git's `skip_fixupish`: the prefix's kind and the text after it, or null. */
function skipPrefix(text: string): { kind: AutosquashKind; rest: string } | null {
  for (const [prefix, kind] of PREFIXES) {
    if (text.startsWith(prefix)) return { kind, rest: text.slice(prefix.length) };
  }
  return null;
}

/**
 * The target text as a hash prefix git would resolve, lowercased, or null.
 * Git reads a commit name from 4 hex digits up (its minimum abbreviation) in
 * either case; below that, `fixup! add` or `fixup! 1` is not a hash to git and
 * falls through to the subject-prefix match.
 */
function asHashPrefix(text: string): string | null {
  return text.length >= MIN_HASH_TERM_LENGTH && /^[0-9a-f]+$/i.test(text) ? text.toLowerCase() : null;
}

/** The kind and target text of an autosquashable subject, or null for an ordinary commit. */
export function parseAutosquashSubject(subject: string): { kind: AutosquashKind; targetText: string } | null {
  const outer = skipPrefix(subject);
  if (!outer) return null;
  let rest = outer.rest;
  for (;;) {
    rest = rest.trimStart();
    const inner = skipPrefix(rest);
    if (!inner) break;
    rest = inner.rest;
  }
  return { kind: outer.kind, targetText: rest };
}

/** The first of `entries[0..end)` matching `predicate`, and whether a second one matches too. */
function firstEarlierMatch(
  entries: readonly RebaseRangeCommit[],
  end: number,
  predicate: (entry: RebaseRangeCommit) => boolean,
): { index: number; ambiguous: boolean } {
  let index = -1;
  for (let j = 0; j < end; j++) {
    if (!predicate(entries[j])) continue;
    if (index >= 0) return { index, ambiguous: true };
    index = j;
  }
  return { index, ambiguous: false };
}

export function findAutosquashLinks(entries: readonly RebaseRangeCommit[]): AutosquashAnalysis {
  const links: AutosquashLink[] = [];
  const unmatched: string[] = [];
  const ambiguous = new Set<string>();
  /** Subject → index of the first ordinary-or-unmatched commit with it (git's `subject2item`). */
  const indexBySubject = new Map<string, number>();
  /** Subject → how many earlier commits carry it, linked or not. */
  const subjectCounts = new Map<string, number>();

  entries.forEach((entry, i) => {
    const parsed = parseAutosquashSubject(entry.subject);
    let linked = false;

    if (parsed) {
      const { targetText } = parsed;
      let targetIndex = indexBySubject.get(targetText) ?? -1;

      if (targetIndex >= 0) {
        if ((subjectCounts.get(targetText) ?? 0) > 1) ambiguous.add(targetText);
      } else {
        const hashPrefix = asHashPrefix(targetText);
        if (hashPrefix !== null) {
          targetIndex = firstEarlierMatch(entries, i, (other) => other.hash.startsWith(hashPrefix)).index;
        }
        if (targetIndex < 0 && targetText.length > 0) {
          const byPrefix = firstEarlierMatch(entries, i, (other) => other.subject.startsWith(targetText));
          targetIndex = byPrefix.index;
          if (byPrefix.ambiguous) ambiguous.add(targetText);
        }
      }

      if (targetIndex >= 0) {
        links.push({ hash: entry.hash, targetHash: entries[targetIndex].hash, kind: parsed.kind });
        linked = true;
      } else {
        unmatched.push(entry.hash);
      }
    }

    if (!linked && !indexBySubject.has(entry.subject)) indexBySubject.set(entry.subject, i);
    subjectCounts.set(entry.subject, (subjectCounts.get(entry.subject) ?? 0) + 1);
  });

  return { links, unmatched, ambiguousSubjects: [...ambiguous] };
}

/** The message an `amend!` commit carries for its target: everything below its title line. */
export function amendReplacementMessage(message: string): string {
  const newline = message.indexOf('\n');
  if (newline < 0) return '';
  // Drop the blank line(s) git puts between the title and the body.
  return message.slice(newline + 1).replace(/^(?:[ \t]*\n)+/, '');
}

/**
 * For each linked commit, the commit at the head of its chain — the one its
 * changes (and an `amend!` message) finally land in.
 */
function resolveGroupLeads(links: readonly AutosquashLink[]): Map<string, string> {
  const targetOf = new Map(links.map((link) => [link.hash, link.targetHash]));
  const leads = new Map<string, string>();
  for (const link of links) {
    let lead = link.targetHash;
    const seen = new Set<string>();
    while (targetOf.has(lead) && !seen.has(lead)) {
      seen.add(lead);
      lead = targetOf.get(lead)!;
    }
    leads.set(link.hash, lead);
  }
  return leads;
}

/**
 * The entries in git's autosquash order: each linked commit directly after its
 * target's chain, `fixup!` → `fixup`, `squash!` → `squash`, and `amend!` →
 * `fixup` with its chain's lead turned into `reword` carrying the `amend!`
 * body (the last `amend!` in the chain wins, as in git).
 *
 * Git expresses `amend!` as `fixup -C`; `reword` + `fixup` gives the same tree
 * and message and works on every git version.
 */
export function applyAutosquash(entries: readonly RebaseEntry[], links: readonly AutosquashLink[]): RebaseEntry[] {
  const indexOf = new Map(entries.map((entry, i) => [entry.hash, i]));
  const next = new Array<number>(entries.length).fill(-1);
  const tail = new Array<number>(entries.length).fill(-1);
  const linked = new Map<string, AutosquashLink>();

  // Git's linked-list insertion, in list order.
  for (const link of links) {
    const i = indexOf.get(link.hash);
    const target = indexOf.get(link.targetHash);
    if (i === undefined || target === undefined || i === target) continue;
    linked.set(link.hash, link);
    const after = tail[target] < 0 ? target : tail[target];
    next[i] = next[after];
    next[after] = i;
    tail[target] = i;
  }

  const leads = resolveGroupLeads([...linked.values()]);
  const rewordMessageByLead = new Map<string, string>();

  const ordered: RebaseEntry[] = [];
  entries.forEach((entry, start) => {
    if (linked.has(entry.hash)) return;
    for (let cur = start; cur >= 0; cur = next[cur]) {
      const item = entries[cur];
      const link = linked.get(item.hash);
      if (!link) {
        ordered.push(item);
        continue;
      }
      ordered.push({ ...item, action: link.kind === 'squash' ? 'squash' : 'fixup', rewordMessage: undefined });
      if (link.kind === 'amend') {
        const replacement = amendReplacementMessage(item.message);
        if (replacement.trim()) rewordMessageByLead.set(leads.get(item.hash)!, replacement);
      }
    }
  });

  return ordered.map((entry) => {
    const rewordMessage = rewordMessageByLead.get(entry.hash);
    return rewordMessage === undefined ? entry : { ...entry, action: 'reword', rewordMessage };
  });
}

/**
 * Undo `applyAutosquash` on a list the user may since have edited: linked
 * commits go back to their original index and to `pick`; leads autosquash
 * turned into `reword` go back to `pick` with no message; every other entry
 * keeps its current order and edits.
 */
export function revertAutosquash(
  currentEntries: readonly RebaseEntry[],
  originalEntries: readonly RebaseEntry[],
  links: readonly AutosquashLink[],
): RebaseEntry[] {
  const linkedHashes = new Set(links.map((link) => link.hash));
  const leads = resolveGroupLeads(links);
  const amendLeads = new Set(links.filter((link) => link.kind === 'amend').map((link) => leads.get(link.hash)));

  const result: RebaseEntry[] = currentEntries
    .filter((entry) => !linkedHashes.has(entry.hash))
    .map((entry) =>
      amendLeads.has(entry.hash) && entry.action === 'reword'
        ? { ...entry, action: 'pick', rewordMessage: undefined }
        : entry,
    );

  originalEntries.forEach((original, index) => {
    if (!linkedHashes.has(original.hash)) return;
    result.splice(Math.min(index, result.length), 0, { ...original, action: 'pick', rewordMessage: undefined });
  });

  return result;
}
