import {
  AUTOLINK_NUMBER_PLACEHOLDER,
  hasCustomAutolinkErrors,
  parseAutolinkPrefix,
  validateCustomAutolinks,
  type CustomAutolink,
} from '@shared/autolinks';
import type { RemoteInfo } from '@shared/types';
import { resolveRemoteAutolinkTarget, type RemoteAutolinkTarget } from './remoteAutolinkTarget';

/**
 * Autolinks: turning references in a commit message into links.
 *
 * Two sources feed one list of rules, and every surface (commit row, details
 * panel, tooltip) renders from that list, so a reference links the same way —
 * or not at all — wherever the message appears:
 *
 * - **custom** rules come from `speedyGit.autolinks.custom` (Jira keys and the like);
 * - **github** / **gitlab** rules come from the repository's remote, and only
 *   when {@link resolveRemoteAutolinkTarget} is confident which repository a bare
 *   `#12` means. They link exactly the references the provider's own web page
 *   links in a commit message, no more.
 */

export type AutolinkSource = 'custom' | RemoteAutolinkTarget['provider'];

export interface AutolinkRule {
  source: AutolinkSource;
  /** Global, unicode. Read with `matchAll`, which works on a copy, so sharing it is safe. */
  pattern: RegExp;
  toUrl: (match: RegExpMatchArray) => string;
}

export interface AutolinkMatch {
  start: number;
  end: number;
  url: string;
  source: AutolinkSource;
}

export interface AutolinkSegment {
  text: string;
  link?: { url: string; source: AutolinkSource };
}

export const EMPTY_AUTOLINK_RULES: readonly AutolinkRule[] = Object.freeze([]);

/**
 * The characters that make a reference part of a longer word: ASCII letters,
 * digits and underscore, as the providers' own pages treat them. Deliberately
 * not `\p{L}`: CJK text has no spaces, so `ABCD-123修复` must still link, as
 * must a reference followed by an emoji or an accented letter.
 */
const WORD_CHARS = 'A-Za-z0-9_';
/** Not preceded by a word character: `ABCD-1` links, `XABCD-1` does not. */
const WORD_START = `(?<![${WORD_CHARS}])`;
/** Not followed by one either: `#12` links, `#12abc` does not. */
const WORD_END = `(?![${WORD_CHARS}])`;
/** An issue number as the providers write it — no `#0`, no leading zeros. */
const ISSUE_NUMBER = '([1-9]\\d*)';
/**
 * Before a bare `#`/`!` reference, additionally not `&` (`&#123;` is an HTML
 * entity) and not another `#`/`!` or `/` (`##1`, `a/#1`).
 */
const REFERENCE_START = `(?<![${WORD_CHARS}&#!/])`;

/** A URL already in the message; nothing inside one is linked a second time. */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gu;

/** Escape regex syntax characters — only those, since a `u`-flag pattern rejects any other escape (`\-`). */
function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function customRule(entry: CustomAutolink): AutolinkRule {
  const id = entry.alphanumeric ? '([A-Za-z0-9]+)' : '(\\d+)';
  const flags = entry.ignoreCase ? 'giu' : 'gu';
  return {
    source: 'custom',
    pattern: new RegExp(`${WORD_START}${escapeForPattern(parseAutolinkPrefix(entry.prefix).text)}${id}${WORD_END}`, flags),
    toUrl: (match) => entry.url.split(AUTOLINK_NUMBER_PLACEHOLDER).join(match[1]),
  };
}

function githubRules({ webBaseUrl, repoPath }: RemoteAutolinkTarget): AutolinkRule[] {
  // GitHub serves a pull request at /issues/N too (redirecting to /pull/N): the
  // two share one number sequence, so one URL is right for either.
  const issueUrl = (path: string, number: string) => `${webBaseUrl}/${path}/issues/${number}`;
  return [
    {
      source: 'github',
      pattern: new RegExp(
        `(?<![${WORD_CHARS}./-])([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?/[A-Za-z0-9._-]+)#${ISSUE_NUMBER}${WORD_END}`,
        'gu',
      ),
      toUrl: (match) => issueUrl(match[1], match[2]),
    },
    {
      source: 'github',
      pattern: new RegExp(`${REFERENCE_START}#${ISSUE_NUMBER}${WORD_END}`, 'gu'),
      toUrl: (match) => issueUrl(repoPath, match[1]),
    },
    {
      source: 'github',
      pattern: new RegExp(`${WORD_START}GH-${ISSUE_NUMBER}${WORD_END}`, 'gu'),
      toUrl: (match) => issueUrl(repoPath, match[1]),
    },
  ];
}

function gitlabRules({ webBaseUrl, repoPath }: RemoteAutolinkTarget): AutolinkRule[] {
  // Unlike GitHub, issues and merge requests are numbered separately, and the
  // sigil says which: `#` an issue, `!` a merge request.
  const referenceUrl = (path: string, sigil: string, number: string) =>
    `${webBaseUrl}/${path}/-/${sigil === '!' ? 'merge_requests' : 'issues'}/${number}`;
  return [
    {
      source: 'gitlab',
      pattern: new RegExp(
        `(?<![${WORD_CHARS}./-])([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+)([#!])${ISSUE_NUMBER}${WORD_END}`,
        'gu',
      ),
      toUrl: (match) => referenceUrl(match[1], match[2], match[3]),
    },
    {
      source: 'gitlab',
      pattern: new RegExp(`${REFERENCE_START}([#!])${ISSUE_NUMBER}${WORD_END}`, 'gu'),
      toUrl: (match) => referenceUrl(repoPath, match[1], match[2]),
    },
  ];
}

/**
 * Every rule that applies, custom ones first: when a custom prefix and a remote
 * reference claim the same text, the user's own rule wins. Invalid custom
 * entries are skipped — the View settings editor is where they get fixed.
 */
export function buildAutolinkRules(
  customAutolinks: readonly CustomAutolink[],
  remoteTarget: RemoteAutolinkTarget | null,
): readonly AutolinkRule[] {
  const errors = validateCustomAutolinks(customAutolinks);
  const rules = customAutolinks
    .filter((_, index) => !hasCustomAutolinkErrors(errors[index]))
    .map(customRule);

  if (remoteTarget?.provider === 'github') rules.push(...githubRules(remoteTarget));
  if (remoteTarget?.provider === 'gitlab') rules.push(...gitlabRules(remoteTarget));

  return rules.length > 0 ? rules : EMPTY_AUTOLINK_RULES;
}

let lastRulesInput: {
  customAutolinks: readonly CustomAutolink[];
  remoteAutolinksEnabled: boolean;
  remotes: readonly RemoteInfo[];
  remoteTarget: RemoteAutolinkTarget | null;
  rules: readonly AutolinkRule[];
} | undefined;

function isSameRemoteTarget(a: RemoteAutolinkTarget | null, b: RemoteAutolinkTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.provider === b.provider && a.webBaseUrl === b.webBaseUrl && a.repoPath === b.repoPath;
}

/**
 * {@link buildAutolinkRules} from the store's own values. Every rendered row
 * asks for the rules; answering with the same array each time keeps
 * `CommitTableRow`'s memo intact. The store keeps the custom list's identity
 * while its content is unchanged, but every refresh re-sends the remotes, so a
 * new remote list is compared by the target it resolves to, and the rules are
 * rebuilt only when what they link would differ.
 */
export function getAutolinkRules(
  customAutolinks: readonly CustomAutolink[],
  remoteAutolinksEnabled: boolean,
  remotes: readonly RemoteInfo[],
): readonly AutolinkRule[] {
  const last = lastRulesInput;
  if (
    last
    && last.customAutolinks === customAutolinks
    && last.remoteAutolinksEnabled === remoteAutolinksEnabled
    && last.remotes === remotes
  ) {
    return last.rules;
  }

  const remoteTarget = remoteAutolinksEnabled ? resolveRemoteAutolinkTarget(remotes) : null;
  const unchanged = last
    && last.customAutolinks === customAutolinks
    && isSameRemoteTarget(last.remoteTarget, remoteTarget);
  const rules = unchanged ? last.rules : buildAutolinkRules(customAutolinks, remoteTarget);
  lastRulesInput = { customAutolinks, remoteAutolinksEnabled, remotes, remoteTarget, rules };
  return rules;
}

/**
 * Every reference in `text`, in order and never overlapping. Where two rules
 * claim overlapping text the one starting first wins, and on a tie the earlier
 * rule (custom before remote). Nothing inside a URL already in the text matches.
 */
export function findAutolinks(text: string, rules: readonly AutolinkRule[]): AutolinkMatch[] {
  if (rules.length === 0) return [];

  const candidates: Array<AutolinkMatch & { priority: number }> = [];
  rules.forEach((rule, priority) => {
    for (const match of text.matchAll(rule.pattern)) {
      const start = match.index ?? 0;
      candidates.push({ start, end: start + match[0].length, url: rule.toUrl(match), source: rule.source, priority });
    }
  });
  if (candidates.length === 0) return [];

  const urlSpans = Array.from(text.matchAll(URL_IN_TEXT), (match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });

  candidates.sort((a, b) => a.start - b.start || a.priority - b.priority);

  const accepted: AutolinkMatch[] = [];
  let claimedUntil = 0;
  for (const { start, end, url, source } of candidates) {
    if (start < claimedUntil) continue;
    if (urlSpans.some((span) => start < span.end && span.start < end)) continue;
    accepted.push({ start, end, url, source });
    claimedUntil = end;
  }
  return accepted;
}

/** `text` cut into plain and linked runs. A text with no reference is one plain segment. */
export function splitAutolinkSegments(text: string, rules: readonly AutolinkRule[]): AutolinkSegment[] {
  const matches = findAutolinks(text, rules);
  if (matches.length === 0) return [{ text }];

  const segments: AutolinkSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) segments.push({ text: text.slice(cursor, match.start) });
    segments.push({ text: text.slice(match.start, match.end), link: { url: match.url, source: match.source } });
    cursor = match.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
