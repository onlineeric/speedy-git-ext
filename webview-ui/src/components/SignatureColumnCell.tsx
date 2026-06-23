import { memo } from 'react';
import { useGraphStore } from '../stores/graphStore';
import { signatureGlyph } from '../utils/signatureGlyph';
import { SignatureVerifiedIcon, SignatureBadIcon, SignatureUnverifiedIcon } from './icons';

/**
 * Signature history-column cell (047-signing-verification, FR-007/013/015).
 *
 * Reads presence + cached verdict by hash (both O(1) map lookups). Render rules:
 * - presence `not-signed` → blank cell (terminal, never verified)
 * - presence `signed` but verdict not yet cached (`undefined`) → loading spinner,
 *   so a signed commit awaiting async verification isn't mistaken for an unsigned one
 * - a cached `null` verdict (resolved, no signature) → blank cell, like unsigned
 * - a cached `CommitSignatureInfo` → its grouped glyph
 * - presence still unknown (cheap presence pass not resolved yet) → blank cell;
 *   we only know it's signed once presence lands
 */
export const SignatureColumnCell = memo(function SignatureColumnCell({ hash }: { hash: string }) {
  const presence = useGraphStore((state) => state.signaturePresence[hash]);
  const signature = useGraphStore((state) => state.signatureCache[hash]);

  if (presence === 'not-signed') return null;

  // `undefined` = verdict not cached yet (pending); `null` = verification resolved
  // but the commit carries no signature. Only a genuinely-pending, signed commit
  // spins, so a cached `null` can never become a stuck spinner.
  if (signature === undefined) {
    if (presence !== 'signed') return null;
    return (
      <div
        className="flex h-full items-center justify-center"
        title="Verifying signature…"
        aria-label="Verifying signature"
      >
        <span
          className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent"
          style={{ color: 'var(--vscode-descriptionForeground)' }}
        />
      </div>
    );
  }
  if (signature === null) return null;

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
