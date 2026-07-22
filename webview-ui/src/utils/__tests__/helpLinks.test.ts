import { describe, it, expect } from 'vitest';
import { UI_ACTIONS } from '@shared/telemetry';
import {
  HELP_LINKS,
  ISSUES_URL,
  formatVersionLabel,
  getExtensionVersion,
} from '../helpLinks';

describe('HELP_LINKS', () => {
  it('points at the GitHub issues page as the primary entry', () => {
    expect(ISSUES_URL).toBe('https://github.com/onlineeric/speedy-git-ext/issues');
    expect(HELP_LINKS[0].url).toBe(ISSUES_URL);
  });

  it('uses https links only', () => {
    for (const link of HELP_LINKS) {
      expect(link.url.startsWith('https://')).toBe(true);
    }
  });

  it('has unique ids and unique urls', () => {
    expect(new Set(HELP_LINKS.map((l) => l.id)).size).toBe(HELP_LINKS.length);
    expect(new Set(HELP_LINKS.map((l) => l.url)).size).toBe(HELP_LINKS.length);
  });

  it('reports only actions from the closed telemetry catalog', () => {
    const catalog = new Set<string>(UI_ACTIONS);
    for (const link of HELP_LINKS) {
      expect(catalog.has(link.telemetryAction)).toBe(true);
    }
  });
});

describe('formatVersionLabel', () => {
  it('renders the version when known', () => {
    expect(formatVersionLabel('5.6.1')).toBe('Speedy Git v5.6.1');
  });

  it('falls back to the bare name when the version is unknown', () => {
    expect(formatVersionLabel(null)).toBe('Speedy Git');
  });
});

describe('getExtensionVersion', () => {
  it('returns null outside a Vite build, where the define is absent', () => {
    expect(getExtensionVersion()).toBeNull();
  });
});
