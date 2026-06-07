import { describe, it, expect, beforeEach } from 'vitest';
import type { CompareResult, SlotValue } from '@shared/types';
import { useGraphStore } from '../graphStore';
import { slotsEqual, slotLabel } from '../../utils/compareSlot';

const FAKE_RESULT: CompareResult = {
  a: { kind: 'commit', hash: 'a'.repeat(40) },
  b: { kind: 'commit', hash: 'b'.repeat(40) },
  mode: 'two-dot',
  fellBackToTwoDot: false,
  aResolvedHash: 'a'.repeat(40),
  bResolvedHash: 'b'.repeat(40),
  files: [],
  stats: { additions: 0, deletions: 0 },
};

describe('slotsEqual', () => {
  it('returns true for null/null and identical sentinels', () => {
    expect(slotsEqual(null, null)).toBe(true);
    expect(slotsEqual({ kind: 'workingTree' }, { kind: 'workingTree' })).toBe(true);
    expect(slotsEqual({ kind: 'head' }, { kind: 'head' })).toBe(true);
    expect(slotsEqual({ kind: 'emptyTree' }, { kind: 'emptyTree' })).toBe(true);
  });

  it('returns false for null vs non-null', () => {
    expect(slotsEqual(null, { kind: 'head' })).toBe(false);
    expect(slotsEqual({ kind: 'head' }, null)).toBe(false);
  });

  it('returns false for different kinds', () => {
    expect(slotsEqual({ kind: 'head' }, { kind: 'workingTree' })).toBe(false);
    expect(slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'tag', name: 'main' })).toBe(false);
  });

  it('compares branch by name and remote', () => {
    expect(slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'main' })).toBe(true);
    expect(slotsEqual({ kind: 'branch', name: 'main', remote: 'origin' }, { kind: 'branch', name: 'main', remote: 'origin' })).toBe(true);
    expect(slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'main', remote: 'origin' })).toBe(false);
    expect(slotsEqual({ kind: 'branch', name: 'main' }, { kind: 'branch', name: 'feat' })).toBe(false);
  });

  it('compares commit hash case-insensitively', () => {
    const lower = { kind: 'commit', hash: 'a'.repeat(40) } satisfies SlotValue;
    const upper = { kind: 'commit', hash: 'A'.repeat(40) } satisfies SlotValue;
    expect(slotsEqual(lower, upper)).toBe(true);
  });

  it('compares expression text after trim', () => {
    expect(slotsEqual(
      { kind: 'expression', text: 'HEAD~3' },
      { kind: 'expression', text: '  HEAD~3  ' },
    )).toBe(true);
    expect(slotsEqual(
      { kind: 'expression', text: 'HEAD~3' },
      { kind: 'expression', text: 'HEAD~4' },
    )).toBe(false);
  });
});

describe('slotLabel', () => {
  it('renders human-readable labels', () => {
    expect(slotLabel({ kind: 'workingTree' })).toBe('Working Tree');
    expect(slotLabel({ kind: 'head' })).toBe('HEAD');
    expect(slotLabel({ kind: 'emptyTree' })).toBe('Empty Tree');
    expect(slotLabel({ kind: 'branch', name: 'main' })).toBe('main');
    expect(slotLabel({ kind: 'branch', name: 'feat', remote: 'origin' })).toBe('origin/feat');
    expect(slotLabel({ kind: 'tag', name: 'v1.0' })).toBe('v1.0');
    expect(slotLabel({ kind: 'commit', hash: 'abcdef1234567890' })).toBe('abcdef1');
    expect(slotLabel({ kind: 'expression', text: 'HEAD~3' })).toBe('HEAD~3');
  });
});

describe('graphStore compare actions', () => {
  beforeEach(() => {
    useGraphStore.getState().clearCompareState();
    useGraphStore.setState({ detailsPanelOpen: false });
  });

  it('setSlotA stores the value, clears resolved hash, and pushes to recents', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    const sel = useGraphStore.getState().compareSelection;
    expect(sel.a).toEqual({ kind: 'branch', name: 'main' });
    expect(sel.aResolvedHash).toBeNull();
    expect(sel.recents[0]).toEqual({ kind: 'branch', name: 'main' });
  });

  it('setSlotA preserves any showing compareResult', () => {
    useGraphStore.setState({ compareResult: FAKE_RESULT });
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    expect(useGraphStore.getState().compareResult).toEqual(FAKE_RESULT);
  });

  it('setSlotB preserves any showing compareResult', () => {
    useGraphStore.setState({ compareResult: FAKE_RESULT });
    useGraphStore.getState().setSlotB({ kind: 'branch', name: 'feat' });
    expect(useGraphStore.getState().compareResult).toEqual(FAKE_RESULT);
  });

  it('setSlotA clears modeOverride when slot kind changes', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setCompareModeOverride('two-dot');
    expect(useGraphStore.getState().compareSelection.modeOverride).toBe('two-dot');
    useGraphStore.getState().setSlotA({ kind: 'commit', hash: 'a'.repeat(40) });
    expect(useGraphStore.getState().compareSelection.modeOverride).toBeNull();
  });

  it('setSlotA preserves modeOverride when slot kind is unchanged', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setCompareModeOverride('two-dot');
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'feat' });
    expect(useGraphStore.getState().compareSelection.modeOverride).toBe('two-dot');
  });

  it('swapSlots exchanges values and resolved hashes while preserving compareResult', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setSlotB({ kind: 'branch', name: 'feat' });
    useGraphStore.setState((s) => ({
      compareSelection: { ...s.compareSelection, aResolvedHash: 'aaa', bResolvedHash: 'bbb' },
      compareResult: FAKE_RESULT,
    }));
    useGraphStore.getState().swapSlots();
    const sel = useGraphStore.getState().compareSelection;
    expect(sel.a).toEqual({ kind: 'branch', name: 'feat' });
    expect(sel.b).toEqual({ kind: 'branch', name: 'main' });
    expect(sel.aResolvedHash).toBe('bbb');
    expect(sel.bResolvedHash).toBe('aaa');
    expect(useGraphStore.getState().compareResult).toEqual(FAKE_RESULT);
  });

  it('setCompareModeOverride preserves any showing compareResult', () => {
    useGraphStore.setState({ compareResult: FAKE_RESULT });
    useGraphStore.getState().setCompareModeOverride('three-dot');
    expect(useGraphStore.getState().compareResult).toEqual(FAKE_RESULT);
  });

  it('clearCompareState resets to EMPTY', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setSlotB({ kind: 'branch', name: 'feat' });
    useGraphStore.setState({ compareResult: FAKE_RESULT });
    useGraphStore.getState().clearCompareState();
    const sel = useGraphStore.getState().compareSelection;
    expect(sel.a).toBeNull();
    expect(sel.b).toBeNull();
    expect(sel.recents).toEqual([]);
    expect(useGraphStore.getState().compareResult).toBeNull();
  });

  it('beginCompare → endCompareSuccess populates resolved hashes', () => {
    useGraphStore.getState().beginCompare('req1');
    expect(useGraphStore.getState().comparePanelUI.loading).toBe(true);
    expect(useGraphStore.getState().comparePanelUI.activeRequestId).toBe('req1');
    expect(useGraphStore.getState().detailsPanelOpen).toBe(true);
    useGraphStore.getState().endCompareSuccess(FAKE_RESULT);
    const sel = useGraphStore.getState().compareSelection;
    expect(useGraphStore.getState().comparePanelUI.loading).toBe(false);
    expect(useGraphStore.getState().compareResult).toEqual(FAKE_RESULT);
    expect(useGraphStore.getState().detailsPanelOpen).toBe(true);
    expect(sel.aResolvedHash).toBe(FAKE_RESULT.aResolvedHash);
    expect(sel.bResolvedHash).toBe(FAKE_RESULT.bResolvedHash);
  });

  it('beginCompare reopens the shared details panel after the user closed it', () => {
    useGraphStore.setState({ compareResult: FAKE_RESULT, detailsPanelOpen: false });

    useGraphStore.getState().beginCompare('req-reopen');

    expect(useGraphStore.getState().detailsPanelOpen).toBe(true);
    expect(useGraphStore.getState().compareResult).toBeNull();
  });

  it('endCompareCancelled does NOT clear slots (FR-025b)', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setSlotB({ kind: 'branch', name: 'feat' });
    useGraphStore.getState().beginCompare('req2');
    useGraphStore.getState().endCompareCancelled();
    const sel = useGraphStore.getState().compareSelection;
    expect(sel.a).toEqual({ kind: 'branch', name: 'main' });
    expect(sel.b).toEqual({ kind: 'branch', name: 'feat' });
    expect(useGraphStore.getState().comparePanelUI.loading).toBe(false);
  });

  it('recents dedup preserves most-recent ordering', () => {
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'feat' });
    useGraphStore.getState().setSlotA({ kind: 'branch', name: 'main' });
    const recents = useGraphStore.getState().compareSelection.recents;
    expect(recents[0]).toEqual({ kind: 'branch', name: 'main' });
    expect(recents[1]).toEqual({ kind: 'branch', name: 'feat' });
    expect(recents.length).toBe(2);
  });
});
