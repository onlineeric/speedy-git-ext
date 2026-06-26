import * as ContextMenu from '@radix-ui/react-context-menu';
import type { SlotValue } from '@shared/types';
import { useGraphStore } from '../stores/graphStore';
import { ensureComparePanelOpen, setSlotsAndCompare } from '../utils/compareDispatch';
import { slotsEqual } from '../utils/compareSlot';
import { menuItemClass, menuItemDisabledClass } from './menuStyles';

interface CompareMenuItemsProps {
  /** The compare slot this row represents (commit, branch, tag, or working-tree sentinel). */
  slot: SlotValue;
  /**
   * For commit rows, the commit hash to also match against the Base's resolved hash —
   * so "Compare with Base" is disabled when the Base ref resolves to this same commit.
   * Branches / tags / working-tree pass nothing (plain slot equality is enough).
   */
  resolvedHash?: string;
}

/**
 * The shared "Set as Compare Base" / "Compare with Base" pair (042-compare-refs).
 * Identical across the commit, branch/tag, and uncommitted context menus, so the
 * slot derivation, store subscription, and handlers live here once.
 *
 * Rendered inside a `ContextMenu.Content`; the caller owns the surrounding
 * availability gate and trailing separator.
 */
export function CompareMenuItems({ slot, resolvedHash }: CompareMenuItemsProps) {
  const compareSelection = useGraphStore((s) => s.compareSelection);
  const setSlotA = useGraphStore((s) => s.setSlotA);

  const base = compareSelection.a;
  const aSet = base !== null;
  const sameAsA = aSet && (
    slotsEqual(base, slot) ||
    (resolvedHash !== undefined && compareSelection.aResolvedHash === resolvedHash)
  );

  const handleSetAsBase = () => {
    setSlotA(slot);
    ensureComparePanelOpen();
  };

  const handleCompareWithBase = () => {
    if (!base || sameAsA) return;
    setSlotsAndCompare(base, slot);
  };

  return (
    <>
      <ContextMenu.Item className={menuItemClass} onSelect={handleSetAsBase}>
        Set as Compare Base
      </ContextMenu.Item>
      {aSet && (
        <ContextMenu.Item
          className={sameAsA ? menuItemDisabledClass : menuItemClass}
          disabled={sameAsA}
          onSelect={handleCompareWithBase}
        >
          Compare with Base
        </ContextMenu.Item>
      )}
    </>
  );
}
