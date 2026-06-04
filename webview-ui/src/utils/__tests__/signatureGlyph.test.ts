import { describe, it, expect } from 'vitest';
import type { SignatureStatus } from '@shared/types';
import { signatureGlyph } from '../signatureGlyph';

describe('signatureGlyph', () => {
  it('maps verified to the verified glyph', () => {
    expect(signatureGlyph('verified')?.category).toBe('verified');
    expect(signatureGlyph('verified')?.glyph).toBe('verified');
  });

  it('maps bad to the problem glyph', () => {
    expect(signatureGlyph('bad')?.category).toBe('problem');
    expect(signatureGlyph('bad')?.glyph).toBe('error');
  });

  it.each<SignatureStatus>([
    'signed-not-trusted',
    'signed-key-missing',
    'signed-not-good',
    'unavailable',
  ])('groups %s into the single cannot-verify glyph', (status) => {
    const glyph = signatureGlyph(status);
    expect(glyph?.category).toBe('cannot-verify');
    expect(glyph?.glyph).toBe('unverified');
  });

  it('maps unsigned to null (blank cell)', () => {
    expect(signatureGlyph('unsigned')).toBeNull();
  });

  it('provides an aria-label for every non-blank glyph', () => {
    const statuses: SignatureStatus[] = [
      'verified',
      'bad',
      'signed-not-trusted',
      'signed-key-missing',
      'signed-not-good',
      'unavailable',
    ];
    for (const status of statuses) {
      expect(signatureGlyph(status)?.ariaLabel).toBeTruthy();
    }
  });
});
