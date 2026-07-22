import { describe, it, expect } from 'vitest';
import { HELP_LINKS, ISSUES_URL, VERSION_LABEL } from '../helpLinks';

describe('HELP_LINKS', () => {
  it('leads with the GitHub issues page — the dialog exists to route people there', () => {
    // Pinned to the literal URL: every link derives from one constant, so a typo
    // there would keep the relative assertions green while sending users to a 404.
    expect(ISSUES_URL).toBe('https://github.com/onlineeric/speedy-git-ext/issues');
    expect(HELP_LINKS[0].url).toBe(ISSUES_URL);
  });

  it('uses https links only', () => {
    for (const link of HELP_LINKS) {
      expect(link.url.startsWith('https://')).toBe(true);
    }
  });

  it('has one row per destination', () => {
    expect(new Set(HELP_LINKS.map((l) => l.url)).size).toBe(HELP_LINKS.length);
  });
});

describe('VERSION_LABEL', () => {
  it('renders the version injected at build time', () => {
    expect(VERSION_LABEL).toBe('Speedy Git v0.0.0-test');
  });
});
