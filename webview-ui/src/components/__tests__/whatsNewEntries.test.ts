import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findWhatsNewEntry, WHATS_NEW_ENTRIES } from '../whatsNewEntries';

/** Vitest runs from the repo root, so the manifest is one predictable hop away. */
const packageVersion: string = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
).version;

describe('whatsNewEntries', () => {
  it('has an entry for the version being shipped', () => {
    // The dialog is chosen by exact version match, so a release whose notes were
    // written against the previous number would silently never appear.
    expect(findWhatsNewEntry(packageVersion)).toBeDefined();
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
