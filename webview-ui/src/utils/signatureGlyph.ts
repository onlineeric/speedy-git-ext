import type { SignatureStatus } from '@shared/types';

/**
 * The three column glyph categories (047-signing-verification, research R3).
 * Seven `SignatureStatus` values collapse to three glyphs for the scannable
 * history column; `unsigned` collapses to no glyph (a blank cell).
 */
export type SignatureGlyphCategory = 'verified' | 'problem' | 'cannot-verify';

export interface SignatureGlyph {
  category: SignatureGlyphCategory;
  /** Logical glyph name consumed by `SignatureColumnCell`. */
  glyph: 'verified' | 'error' | 'unverified';
  ariaLabel: string;
  /** Theme-aware color, mirroring the details-panel palette. */
  color: string;
}

/**
 * Exported so the details panel's signature *labels* use the same colors as the
 * history column's *glyphs* — the two sit on screen together, and a "Verified"
 * label in a different green from the tick beside it reads as a second state.
 * The hexes are fallbacks only; the theme token wins whenever it is defined.
 */
export const SIGNATURE_VERIFIED_COLOR = 'var(--vscode-testing-iconPassed, #4CAF50)';
export const SIGNATURE_PROBLEM_COLOR = 'var(--vscode-editorError-foreground, #F44336)';
export const SIGNATURE_CANNOT_VERIFY_COLOR = 'var(--vscode-editorWarning-foreground, #FFCC00)';

/**
 * Map a 7-state `SignatureStatus` to a grouped column glyph, or `null` for
 * `unsigned` (which renders as a blank cell, FR-007). Pure and O(1).
 */
export function signatureGlyph(status: SignatureStatus): SignatureGlyph | null {
  switch (status) {
    case 'verified':
      return { category: 'verified', glyph: 'verified', ariaLabel: 'Verified signature', color: SIGNATURE_VERIFIED_COLOR };
    case 'bad':
      return { category: 'problem', glyph: 'error', ariaLabel: 'Bad signature', color: SIGNATURE_PROBLEM_COLOR };
    case 'signed-not-trusted':
    case 'signed-key-missing':
    case 'signed-not-good':
    case 'unavailable':
      return {
        category: 'cannot-verify',
        glyph: 'unverified',
        ariaLabel: 'Signed, but cannot verify locally',
        color: SIGNATURE_CANNOT_VERIFY_COLOR,
      };
    case 'unsigned':
      return null;
  }
}
