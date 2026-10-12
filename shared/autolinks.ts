/**
 * Custom autolinks — the `speedyGit.autolinks.custom` setting.
 *
 * Each entry turns `<prefix><number>` in a commit message into a link, the way
 * GitLens's `gitlens.autolinks` does. The entry shape is deliberately GitLens's
 * own (`prefix`, `url` with a `<num>` placeholder, optional `ignoreCase` and
 * `alphanumeric`), so a GitLens user can paste their array in unchanged.
 *
 * Shared because both sides read it: the backend normalizes what the settings
 * file holds and re-validates what the webview asks to save, and the webview
 * validates the View settings editor before sending. Two copies of "what makes
 * an entry valid" would let the dialog accept something the backend refuses.
 */

/** Where the matched number (or alphanumeric id) goes in an autolink's URL. */
export const AUTOLINK_NUMBER_PLACEHOLDER = '<num>';

export interface CustomAutolink {
  /** Literal text that precedes the number, e.g. `ABCD-`. */
  prefix: string;
  /** URL template containing {@link AUTOLINK_NUMBER_PLACEHOLDER}. */
  url: string;
  /** Match the prefix in any letter case. */
  ignoreCase?: boolean;
  /** Match letters and digits after the prefix, not just digits. */
  alphanumeric?: boolean;
}

/** Per-field validation messages for one entry; an empty object means valid. */
export interface CustomAutolinkErrors {
  prefix?: string;
  url?: string;
}

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
 * silently deleting it. Rule building skips invalid entries on its own.
 */
export function normalizeCustomAutolinks(value: unknown): CustomAutolink[] {
  if (!Array.isArray(value)) return [];

  const entries: CustomAutolink[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { prefix, url, ignoreCase, alphanumeric } = item as Record<string, unknown>;
    if (typeof prefix !== 'string' || typeof url !== 'string') continue;

    const entry: CustomAutolink = { prefix, url };
    if (ignoreCase === true) entry.ignoreCase = true;
    if (alphanumeric === true) entry.alphanumeric = true;
    entries.push(entry);
  }
  return entries;
}

/** Validate one entry in isolation (duplicates are a list-level check). */
export function validateCustomAutolink(entry: CustomAutolink): CustomAutolinkErrors {
  const errors: CustomAutolinkErrors = {};
  const prefix = entry.prefix.trim();
  const url = entry.url.trim();

  if (prefix.length === 0) {
    errors.prefix = 'Enter a prefix, like ABCD-';
  } else if (/\s/.test(prefix)) {
    errors.prefix = 'A prefix cannot contain spaces';
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
 * Validate a whole list, index-aligned with the input. A prefix repeated later
 * in the list is reported on the repeat: the first one is the one that links.
 */
export function validateCustomAutolinks(entries: readonly CustomAutolink[]): CustomAutolinkErrors[] {
  const seenPrefixes = new Set<string>();
  return entries.map((entry) => {
    const errors = validateCustomAutolink(entry);
    const prefix = entry.prefix.trim();
    if (!errors.prefix) {
      if (seenPrefixes.has(prefix)) errors.prefix = 'This prefix is already used above';
      seenPrefixes.add(prefix);
    }
    return errors;
  });
}

/** Trim both fields, keeping the options an entry already had. */
export function trimCustomAutolink(entry: CustomAutolink): CustomAutolink {
  return { ...entry, prefix: entry.prefix.trim(), url: entry.url.trim() };
}
