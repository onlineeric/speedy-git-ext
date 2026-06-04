import { memo } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { signatureGlyph } from '../utils/signatureGlyph';
import { SignatureVerifiedIcon, SignatureBadIcon, SignatureUnverifiedIcon } from './icons';

/**
 * Signature history-column cell (047-signing-verification, FR-007/013/015).
 *
 * Reads presence + cached verdict by hash (both O(1) map lookups). Render rules:
 * - presence `not-signed` → blank cell (terminal, never verified)
 * - a cached `CommitSignatureInfo` → its grouped glyph
 * - otherwise (presence unknown, or signed with verdict not yet cached) → nothing
 *   while the async passes resolve (no per-row spinner — FR-014)
 */
export const SignatureColumnCell = memo(function SignatureColumnCell({ hash }: { hash: string }) {
  const presence = useGraphStore((state) => state.signaturePresence[hash]);
  const signature = useGraphStore((state) => state.signatureCache[hash]);

  if (presence === 'not-signed') return null;
  if (!signature) return null;

  const glyph = signatureGlyph(signature.status);
  if (!glyph) return null;

  return (
    <div className="flex h-full items-center justify-center" title={glyph.ariaLabel} aria-label={glyph.ariaLabel}>
      <GlyphIcon glyph={glyph.glyph} color={glyph.color} />
    </div>
  );
});

function GlyphIcon({ glyph, color }: { glyph: 'verified' | 'error' | 'unverified'; color: string }) {
  const style = { color };
  switch (glyph) {
    case 'verified':
      return <SignatureVerifiedIcon style={style} />;
    case 'error':
      return <SignatureBadIcon style={style} />;
    case 'unverified':
      return <SignatureUnverifiedIcon style={style} />;
  }
}
