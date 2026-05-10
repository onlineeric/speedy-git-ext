import type { CompareMode, SlotValue } from '@shared/types';
import { rpcClient } from '../rpc/rpcClient';
import { useGraphStore } from '../stores/graphStore';
import { defaultMode } from './compareDefaults';

/** Generate a compare requestId. Lightweight per-call ID; uniqueness only required
 *  within the lifetime of a single in-flight compare. */
function generateRequestId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Compute the effective compare mode given slots and any explicit override.
 * Override wins until the slot kind changes; the store clears the override on
 * kind change. (Research Decision 4 — 042-compare-refs.)
 */
export function effectiveCompareMode(a: SlotValue, b: SlotValue, override: CompareMode | null): CompareMode {
  return override ?? defaultMode(a, b);
}

/**
 * Begin a compare RPC. Sets the loading flag, generates a requestId, and
 * dispatches `compareRefs` to the backend. Used by:
 *  - The Compare button in CompareWidget (panel-driven, US2/US5).
 *  - Right-click "Compare with Base" / "Compare these commits" (US1/US4 — auto-trigger per FR-019).
 *  - Auto-refresh re-run for working-tree compares (FR-032).
 *
 * 042-compare-refs.
 */
export function dispatchCompare(a: SlotValue, b: SlotValue, mode: CompareMode): void {
  const requestId = generateRequestId();
  useGraphStore.getState().beginCompare(requestId);
  rpcClient.compareRefs({ a, b, mode, requestId });
}

/**
 * Make the Compare toggle panel the active panel (FR-013, Session 2026-05-09).
 * Closes any other open toggle panel (Filter / Search) since only one panel may
 * be open at a time. No-op when Compare is already active. Idempotent.
 */
export function ensureComparePanelOpen(): void {
  const store = useGraphStore.getState();
  if (store.activeToggleWidget === 'compare') return;
  // setActiveToggleWidget toggles when called with the current value; calling it
  // with 'compare' from any other state ('search', 'filter', or null) sets it to
  // 'compare' and closes whatever was open.
  store.setActiveToggleWidget('compare');
}

/** Dispatch a compare run by setting both slots and dispatching with the
 *  effective mode. Used by right-click entry points that auto-fill A and B
 *  and run immediately (FR-019). Also opens the Compare panel (FR-013). */
export function setSlotsAndCompare(a: SlotValue, b: SlotValue): void {
  const store = useGraphStore.getState();
  store.setSlotA(a);
  store.setSlotB(b);
  ensureComparePanelOpen();
  // Read fresh state after the setters so modeOverride reflects any kind-change reset.
  const fresh = useGraphStore.getState().compareSelection;
  const mode = effectiveCompareMode(a, b, fresh.modeOverride);
  dispatchCompare(a, b, mode);
}
