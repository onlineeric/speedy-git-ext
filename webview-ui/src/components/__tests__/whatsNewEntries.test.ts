import { describe, expect, it } from 'vitest';
import { isExactVersion } from '@shared/whatsNew';
import { findUnseenWhatsNewEntry, WHATS_NEW_ENTRIES } from '../whatsNewEntries';

describe('whatsNewEntries', () => {
  it('gives every entry a version a package.json version could actually equal', () => {
    // Entries are resolved from exact versions only, so notes filed under a malformed
    // version ('v5.11.0', '5.11', a stray space, a letter O for a zero) would never
    // appear and nothing else would complain. A release is free to have no entry at
    // all — that is how it opts out — but an entry that can never match is a typo.
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(isExactVersion(entry.version), `${entry.version} is not an exact version`).toBe(true);
    }
  });

  it('returns nothing for a series with no notes, which is how a release opts out', () => {
    expect(findUnseenWhatsNewEntry({ version: '0.0.0', lastShownVersion: undefined })).toBeUndefined();
  });

  it('resolves every entry for its own version until that entry has been seen', () => {
    for (const entry of WHATS_NEW_ENTRIES) {
      expect(findUnseenWhatsNewEntry({ version: entry.version, lastShownVersion: undefined })).toBe(entry);
      expect(findUnseenWhatsNewEntry({ version: entry.version, lastShownVersion: entry.version })).toBeUndefined();
    }
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
