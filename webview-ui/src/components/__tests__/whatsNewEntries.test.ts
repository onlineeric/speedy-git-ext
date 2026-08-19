import { describe, expect, it } from 'vitest';
import { findWhatsNewEntry, WHATS_NEW_ENTRIES } from '../whatsNewEntries';

/** Exactly what `package.json` versions look like — the only strings a lookup can match. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

describe('whatsNewEntries', () => {
  it('gives every entry a version a package.json version could actually equal', () => {
    // The dialog is chosen by exact string match, so notes filed under a malformed
    // version ('v5.11.0', '5.11', a stray space, a letter O for a zero) would never
    // appear and nothing else would complain. A release is free to have no entry at
    // all — that is how it opts out — but an entry that can never match is a typo.
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(entry.version, `${entry.version} is not an exact version`).toMatch(EXACT_VERSION);
    }
  });

  it('returns nothing for a version with no notes, which is how a release opts out', () => {
    expect(findWhatsNewEntry('0.0.0-nonexistent')).toBeUndefined();
  });

  it('gives every entry a unique version, so the lookup cannot be ambiguous', () => {
    const versions = WHATS_NEW_ENTRIES.map((entry) => entry.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('gives every entry a headline and content', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(entry.headline.trim(), `${entry.version} headline`).not.toBe('');
      expect(entry.content, `${entry.version} content`).toBeTruthy();
    }
  });
});
