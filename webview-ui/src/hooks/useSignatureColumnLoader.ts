import { useEffect, useRef } from 'react';
import type { Commit } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { rpcClient } from '../rpc/rpcClient';

/**
 * Only real commit objects can be signature-verified. The merged commit list also
 * contains synthetic rows — the uncommitted node and stash entries — whose
 * pseudo-hashes are not valid git object ids and must never be sent to the
 * signature backend (they reject the whole batch). Matches CommitTableRow's guard.
 */
function isVerifiableCommit(commit: Commit): boolean {
  return !commit.refs.some((ref) => ref.type === 'uncommitted' || ref.type === 'stash');
}

interface UseSignatureColumnLoaderParams {
  /** True only when the signature column is visible (FR-013: zero work when hidden). */
  enabled: boolean;
  commits: Commit[];
  /** Inclusive virtualizer range — visible rows are scheduled first (FR-016). */
  rangeStart: number;
  rangeEnd: number;
}

/**
 * Viewport-first signature scheduler for the history column
 * (047-signing-verification, research R4).
 *
 * Two lazy passes, each visible-range-first then a background pass over the
 * loaded-but-offscreen remainder:
 *  1. **Presence** (cheap, config-independent): for hashes with no cached
 *     presence. `not-signed` is terminal → blank cell, never verified.
 *  2. **Verification** (expensive): only for hashes whose presence is `signed`
 *     and whose verdict isn't cached yet.
 *
 * Every request is idempotently guarded so the frequent re-runs (scroll, cache
 * merges) never re-spawn git work. No-op when the column is hidden.
 */
export function useSignatureColumnLoader({
  enabled,
  commits,
  rangeStart,
  rangeEnd,
}: UseSignatureColumnLoaderParams): void {
  const signaturePresence = useGraphStore((state) => state.signaturePresence);
  const signaturePresenceLoading = useGraphStore((state) => state.signaturePresenceLoading);
  const signaturePresenceFailed = useGraphStore((state) => state.signaturePresenceFailed);
  const signatureCache = useGraphStore((state) => state.signatureCache);
  const signatureLoading = useGraphStore((state) => state.signatureLoading);
  const clearSignaturePresenceFailures = useGraphStore((state) => state.clearSignaturePresenceFailures);

  const wasEnabled = useRef(enabled);
  useEffect(() => {
    if (enabled && !wasEnabled.current) {
      clearSignaturePresenceFailures(
        commits.filter(isVerifiableCommit).map((commit) => commit.hash)
      );
    }
    wasEnabled.current = enabled;
  }, [enabled, commits, clearSignaturePresenceFailures]);

  useEffect(() => {
    if (!enabled || commits.length === 0 || rangeEnd < rangeStart) return;

    const lastIndex = commits.length - 1;
    const start = Math.max(0, rangeStart);
    const end = Math.min(lastIndex, rangeEnd);

    // Synthetic rows (the uncommitted node, stash entries) have no commit object
    // to verify; their pseudo-hashes (e.g. `UNCOMMITTED`) fail git's hash
    // validation and would reject the entire batch. Skip them — they never render
    // a glyph anyway (CommitTableRow returns null for these rows).
    const visible: string[] = [];
    for (let i = start; i <= end; i++) {
      if (isVerifiableCommit(commits[i])) visible.push(commits[i].hash);
    }
    const visibleSet = new Set(visible);
    const offscreen = commits
      .filter((c) => isVerifiableCommit(c) && !visibleSet.has(c.hash))
      .map((c) => c.hash);

    // ── Presence pass (cheap) — visible first, then the offscreen remainder ──
    const needsPresence = (hash: string) =>
      signaturePresence[hash] === undefined &&
      !signaturePresenceLoading[hash] &&
      !signaturePresenceFailed[hash];
    const sendPresence = (hashes: string[]) => {
      if (hashes.length === 0) return;
      rpcClient.detectSignaturePresence(hashes);
    };
    sendPresence(visible.filter(needsPresence));
    sendPresence(offscreen.filter(needsPresence));

    // ── Verification pass (expensive, signed-only) — visible first ──
    const needsVerify = (hash: string) =>
      signaturePresence[hash] === 'signed' &&
      signatureCache[hash] === undefined &&
      !signatureLoading[hash];
    const visibleVerify = visible.filter(needsVerify);
    const offscreenVerify = offscreen.filter(needsVerify);
    if (visibleVerify.length > 0) rpcClient.verifySignatures(visibleVerify);
    if (offscreenVerify.length > 0) rpcClient.verifySignatures(offscreenVerify);
  }, [
    enabled,
    commits,
    rangeStart,
    rangeEnd,
    signaturePresence,
    signaturePresenceLoading,
    signaturePresenceFailed,
    signatureCache,
    signatureLoading,
  ]);
}
