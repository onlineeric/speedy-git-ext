import type { CompareMode, SlotValue } from '@shared/types';

/**
 * Compute the default 2-dot / 3-dot mode from the slot kinds (FR-009 / FR-010 /
 * FR-011 — research Decision 4). The default re-applies whenever the slot's
 * kind changes; the store clears `modeOverride` on slot kind change so the
 * default reasserts itself.
 *
 * Rules:
 *  - Either side is `workingTree` → `'two-dot'` (3-dot is disabled in UI per FR-011).
 *  - Both sides are refs (branch / tag) → `'three-dot'`.
 *  - Otherwise (any side is commit / expression / head / emptyTree) → `'two-dot'`.
 *
 * 042-compare-refs.
 */
export function defaultMode(a: SlotValue | null, b: SlotValue | null): CompareMode {
  if (!a || !b) return 'two-dot';
  if (a.kind === 'workingTree' || b.kind === 'workingTree') return 'two-dot';
  const aIsRef = a.kind === 'branch' || a.kind === 'tag';
  const bIsRef = b.kind === 'branch' || b.kind === 'tag';
  if (aIsRef && bIsRef) return 'three-dot';
  return 'two-dot';
}
