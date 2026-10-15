/**
 * Custom autolinks — the `speedyGit.autolinks.custom` setting.
 *
 * Each entry turns `<prefix><number>` in a commit message into a link, the way
 * GitLens's `gitlens.autolinks` does. The entry shape is deliberately GitLens's
 * own (`prefix`, `url` with a `<num>` placeholder, optional `ignoreCase` and
 * `alphanumeric`), so a GitLens user can paste their array in unchanged. One
 * default differs: a prefix matches in any letter case unless `ignoreCase` is
 * `false`, because people type a ticket key as `jira-12` as often as `JIRA-12`.
 *
 * Shared because both sides read it: the backend normalizes what the settings
 * file holds and re-validates what the webview asks to save, and the webview
 * validates the View settings editor before sending. Two copies of "what makes
 * an entry valid" would let the dialog accept something the backend refuses.
 */

/** Where the matched number (or alphanumeric id) goes in an autolink's URL. */
export const AUTOLINK_NUMBER_PLACEHOLDER = '<num>';

export interface CustomAutolink {
  /**
   * Literal text that precedes the number, e.g. `ABCD-`. Wrapped in double
   * quotes (`"Jira "`) it may contain spaces; see {@link parseAutolinkPrefix}.
   */
  prefix: string;
  /** URL template containing {@link AUTOLINK_NUMBER_PLACEHOLDER}. */
  url: string;
  /**
   * Match the prefix in any letter case. Absent means `true`; read it through
   * {@link customAutolinkIgnoresCase}, never as a plain truthiness check.
   */
  ignoreCase?: boolean;
  /** Match letters and digits after the prefix, not just digits. */
  alphanumeric?: boolean;
}

/** Whether an entry's prefix matches in any letter case — the default unless `ignoreCase` is `false`. */
export function customAutolinkIgnoresCase(entry: CustomAutolink): boolean {
  return entry.ignoreCase !== false;
}

/** What a prefix means once its optional quotes are read. */
export interface ParsedAutolinkPrefix {
  /** The literal text to match: quotes removed, `\"` turned into `"`. */
  text: string;
  /** Whether the prefix was written inside double quotes. */
  quoted: boolean;
}

const PREFIX_QUOTE = '"';
const ESCAPED_PREFIX_QUOTE = '\\"';

/**
 * Read a prefix as the user wrote it. A prefix is trimmed, so a space that
 * should count has to sit inside double quotes: `"Jira "` matches `Jira 123`.
 * Inside the quotes everything is literal except `\"`, which is a double quote.
 *
 * Quoting needs both quotes, and the closing one must not be escaped; anything
 * else (`"`, `"abc`, `"abc\"`) is an ordinary unquoted prefix, quote characters
 * included, so a prefix that merely contains a `"` keeps matching it.
 *
 * The one place quoting is decoded: validation, the duplicate check and rule
 * building all read the prefix through here, so they cannot disagree on it.
 */
export function parseAutolinkPrefix(prefix: string): ParsedAutolinkPrefix {
  const text = prefix.trim();
  const isQuoted = text.length >= 2
    && text.startsWith(PREFIX_QUOTE)
    && text.endsWith(PREFIX_QUOTE)
    && !text.endsWith(ESCAPED_PREFIX_QUOTE);
  if (!isQuoted) return { text, quoted: false };

  return { text: text.slice(1, -1).split(ESCAPED_PREFIX_QUOTE).join(PREFIX_QUOTE), quoted: true };
}

/** Per-field validation messages for one entry; an empty object means valid. */
export interface CustomAutolinkErrors {
  prefix?: string;
  url?: string;
}

/** The message on a prefix an earlier entry already matches — the one list-level check. */
export const REPEATED_PREFIX_ERROR = 'This prefix is already used above';

/** True for an absolute `http:` or `https:` URL — the only kind a commit message may open. */
export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Coerce whatever the settings file holds into well-typed entries.
 *
 * Shape only: an entry with string `prefix` and `url` survives even when it is
 * invalid, so the View settings editor shows it to be fixed rather than a save
 * silently deleting it. Rule building skips invalid entries on its own. Both
 * fields are trimmed here, the one gate every settings read and write passes,
 * so what validation judges is what the rules match.
 */
export function normalizeCustomAutolinks(value: unknown): CustomAutolink[] {
  if (!Array.isArray(value)) return [];

  const entries: CustomAutolink[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { prefix, url, ignoreCase, alphanumeric } = item as Record<string, unknown>;
    if (typeof prefix !== 'string' || typeof url !== 'string') continue;

    const entry: CustomAutolink = { prefix: prefix.trim(), url: url.trim() };
    // Only the non-default value is kept, so `true` and absent are one form.
    if (ignoreCase === false) entry.ignoreCase = false;
    if (alphanumeric === true) entry.alphanumeric = true;
    entries.push(entry);
  }
  return entries;
}

/** Validate one entry in isolation (duplicates are a list-level check). */
export function validateCustomAutolink(entry: CustomAutolink): CustomAutolinkErrors {
  const errors: CustomAutolinkErrors = {};
  const prefix = parseAutolinkPrefix(entry.prefix);
  const url = entry.url.trim();

  if (prefix.quoted) {
    if (prefix.text.trim().length === 0) {
      errors.prefix = 'Enter text between the quotes, like "Jira "';
    } else if (/[^\S ]/.test(prefix.text)) {
      errors.prefix = 'Only plain spaces are allowed inside the quotes';
    }
  } else if (prefix.text.length === 0) {
    errors.prefix = 'Enter a prefix, like ABCD-';
  } else if (/\s/.test(prefix.text)) {
    errors.prefix = 'A prefix with spaces must be in double quotes, like "Jira "';
  }

  if (url.length === 0) {
    errors.url = 'Enter a URL';
  } else if (!url.includes(AUTOLINK_NUMBER_PLACEHOLDER)) {
    errors.url = `Put ${AUTOLINK_NUMBER_PLACEHOLDER} where the ticket number goes`;
  } else if (!isHttpUrl(url.split(AUTOLINK_NUMBER_PLACEHOLDER).join('1'))) {
    errors.url = 'Use an http:// or https:// URL';
  }

  return errors;
}

export function hasCustomAutolinkErrors(errors: CustomAutolinkErrors): boolean {
  return errors.prefix !== undefined || errors.url !== undefined;
}

/**
 * Validate a whole list, index-aligned with the input. A prefix that an earlier
 * entry already matches is reported on the repeat: the first one is the one
 * that links, so the repeat would never link anything. That covers any casing
 * of a prefix after an entry that ignores case (`Jira-` then `JIRA-`), and the
 * same text after a case-sensitive entry when the repeat is case-sensitive too.
 * A case-insensitive repeat of a case-sensitive prefix still links the other
 * casings, whichever casing it is written in, so it is not a repeat.
 */
export function validateCustomAutolinks(entries: readonly CustomAutolink[]): CustomAutolinkErrors[] {
  const exactPrefixes = new Set<string>();
  const anyCasePrefixes = new Set<string>();
  return entries.map((entry) => {
    const errors = validateCustomAutolink(entry);
    const prefix = parseAutolinkPrefix(entry.prefix).text;
    if (!errors.prefix) {
      const lowerPrefix = prefix.toLowerCase();
      const ignoresCase = customAutolinkIgnoresCase(entry);
      const isRepeat = anyCasePrefixes.has(lowerPrefix) || (!ignoresCase && exactPrefixes.has(prefix));
      if (isRepeat) errors.prefix = REPEATED_PREFIX_ERROR;
      exactPrefixes.add(prefix);
      if (ignoresCase) anyCasePrefixes.add(lowerPrefix);
    }
    return errors;
  });
}

/** Trim both fields, keeping the options an entry already had. */
export function trimCustomAutolink(entry: CustomAutolink): CustomAutolink {
  return { ...entry, prefix: entry.prefix.trim(), url: entry.url.trim() };
}

function isSameCustomAutolink(a: CustomAutolink, b: CustomAutolink): boolean {
  return a.prefix === b.prefix
    && a.url === b.url
    && customAutolinkIgnoresCase(a) === customAutolinkIgnoresCase(b)
    && (a.alphanumeric ?? false) === (b.alphanumeric ?? false);
}

/** Whether two lists hold the same entries in the same order, compared exactly as given. */
export function isSameCustomAutolinkList(a: readonly CustomAutolink[], b: readonly CustomAutolink[]): boolean {
  return a.length === b.length && a.every((entry, index) => isSameCustomAutolink(entry, b[index]));
}
