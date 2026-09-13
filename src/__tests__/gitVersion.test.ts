import { describe, expect, it } from 'vitest';
import {
  formatGitFeatureMinimum,
  formatGitVersion,
  parseGitVersion,
  supportsGitFeature,
  usesNonInteractiveAutosquash,
} from '../../shared/gitVersion.js';

describe('parseGitVersion', () => {
  it.each([
    ['2.43.0', [2, 43, 0]],
    ['git version 2.43.0', [2, 43, 0]],
    ['2.39.3 (Apple Git-145)', [2, 39, 3]],
    ['2.45.1.windows.1', [2, 45, 1]],
    ['  2.30.1\n', [2, 30, 1]],
    ['2.44', [2, 44, 0]],
  ])('parses %j', (raw, expected) => {
    expect(parseGitVersion(raw)).toEqual(expected);
  });

  it.each(['', 'garbage', 'git version', 'v2.43.0', 'two.forty'])('returns null for %j', (raw) => {
    expect(parseGitVersion(raw)).toBeNull();
  });

  it('formats back to dotted form', () => {
    expect(formatGitVersion([2, 30, 1])).toBe('2.30.1');
  });
});

describe('supportsGitFeature', () => {
  it('draws the amend/reword line at 2.32.0', () => {
    expect(supportsGitFeature([2, 31, 9], 'fixupAmendReword')).toBe(false);
    expect(supportsGitFeature([2, 32, 0], 'fixupAmendReword')).toBe(true);
    expect(supportsGitFeature([3, 0, 0], 'fixupAmendReword')).toBe(true);
  });

  it('draws the non-interactive autosquash line at 2.44.0', () => {
    expect(supportsGitFeature([2, 43, 7], 'nonInteractiveAutosquash')).toBe(false);
    expect(supportsGitFeature([2, 44, 0], 'nonInteractiveAutosquash')).toBe(true);
  });

  it('fails open for an unknown version', () => {
    expect(supportsGitFeature(null, 'fixupAmendReword')).toBe(true);
    expect(supportsGitFeature(null, 'nonInteractiveAutosquash')).toBe(true);
  });
});

describe('usesNonInteractiveAutosquash', () => {
  it('uses the plain form from 2.44.0', () => {
    expect(usesNonInteractiveAutosquash([2, 43, 9])).toBe(false);
    expect(usesNonInteractiveAutosquash([2, 44, 0])).toBe(true);
  });

  it('picks the universal -i form for an unknown version', () => {
    expect(usesNonInteractiveAutosquash(null)).toBe(false);
  });
});

describe('formatGitFeatureMinimum', () => {
  it('writes the minimum the way release notes do', () => {
    expect(formatGitFeatureMinimum('fixupAmendReword')).toBe('2.32');
  });
});
