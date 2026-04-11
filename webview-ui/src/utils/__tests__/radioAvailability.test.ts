import { describe, it, expect } from 'vitest';
import type { FileChange } from '@shared/types';
import {
  computeRadioAvailability,
  applyDefaultRadioRule,
  type ActionKind,
} from '../radioAvailability';

function mkFile(path: string, stageState: 'staged' | 'unstaged', status: FileChange['status'] = 'modified'): FileChange {
  return { path, status, stageState };
}

describe('computeRadioAvailability', () => {
  const stagedA = mkFile('a.ts', 'staged');
  const stagedB = mkFile('b.ts', 'staged');
  const unstagedC = mkFile('c.ts', 'unstaged');
  const unstagedD = mkFile('d.ts', 'unstaged');

  // dual-state: same path appears in both staged AND unstaged lists
  const dualStaged = mkFile('dual.ts', 'staged');
  const dualUnstaged = mkFile('dual.ts', 'unstaged');

  it('no selection → everything disabled, all counts 0', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(),
      stagedFiles: [stagedA, stagedB],
      unstagedFiles: [unstagedC, unstagedD],
    });
    expect(result).toEqual({
      stageEnabled: false,
      unstageEnabled: false,
      discardEnabled: false,
      stashEnabled: false,
      stageCount: 0,
      unstageCount: 0,
      discardCount: 0,
      stashCount: 0,
    });
  });

  it('only unstaged selected → Stage/Discard/Stash enabled, Unstage disabled', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(['c.ts', 'd.ts']),
      stagedFiles: [stagedA, stagedB],
      unstagedFiles: [unstagedC, unstagedD],
    });
    expect(result.stageEnabled).toBe(true);
    expect(result.unstageEnabled).toBe(false);
    expect(result.discardEnabled).toBe(true);
    expect(result.stashEnabled).toBe(true);
    expect(result.stageCount).toBe(2);
    expect(result.unstageCount).toBe(0);
    expect(result.discardCount).toBe(2);
    expect(result.stashCount).toBe(2);
  });

  it('only staged selected → Unstage/Stash enabled, Stage/Discard disabled', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(['a.ts', 'b.ts']),
      stagedFiles: [stagedA, stagedB],
      unstagedFiles: [unstagedC, unstagedD],
    });
    expect(result.stageEnabled).toBe(false);
    expect(result.unstageEnabled).toBe(true);
    expect(result.discardEnabled).toBe(false);
    expect(result.stashEnabled).toBe(true);
    expect(result.stageCount).toBe(0);
    expect(result.unstageCount).toBe(2);
    expect(result.discardCount).toBe(0);
    expect(result.stashCount).toBe(2);
  });

  it('mixed selection → all four enabled with correct counts', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(['a.ts', 'c.ts', 'd.ts']),
      stagedFiles: [stagedA, stagedB],
      unstagedFiles: [unstagedC, unstagedD],
    });
    expect(result.stageEnabled).toBe(true);
    expect(result.unstageEnabled).toBe(true);
    expect(result.discardEnabled).toBe(true);
    expect(result.stashEnabled).toBe(true);
    // 2 unstaged and 1 staged selected
    expect(result.stageCount).toBe(2);
    expect(result.unstageCount).toBe(1);
    expect(result.discardCount).toBe(2);
    expect(result.stashCount).toBe(3);
  });

  it('single dual-state file alone qualifies as "mixed" (FR-015a)', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(['dual.ts']),
      stagedFiles: [dualStaged],
      unstagedFiles: [dualUnstaged],
    });
    expect(result.stageEnabled).toBe(true);
    expect(result.unstageEnabled).toBe(true);
    expect(result.discardEnabled).toBe(true);
    expect(result.stashEnabled).toBe(true);
    // Dual-state: stageCount=1 (has unstaged side), unstageCount=1 (has staged side)
    expect(result.stageCount).toBe(1);
    expect(result.unstageCount).toBe(1);
    expect(result.discardCount).toBe(1);
    // Stash counts distinct paths: 1
    expect(result.stashCount).toBe(1);
  });

  it('dual-state + pure unstaged → all enabled; counts reflect dual-state on both sides', () => {
    const result = computeRadioAvailability({
      selectedPaths: new Set(['dual.ts', 'c.ts']),
      stagedFiles: [dualStaged],
      unstagedFiles: [dualUnstaged, unstagedC],
    });
    expect(result.stageCount).toBe(2); // dual + c
    expect(result.unstageCount).toBe(1); // dual only
    expect(result.discardCount).toBe(2);
    expect(result.stashCount).toBe(2);
  });
});

describe('applyDefaultRadioRule', () => {
  const allEnabled = {
    stageEnabled: true,
    unstageEnabled: true,
    discardEnabled: true,
    stashEnabled: true,
    stageCount: 1,
    unstageCount: 1,
    discardCount: 1,
    stashCount: 1,
  };
  const onlyUnstaged = {
    stageEnabled: true,
    unstageEnabled: false,
    discardEnabled: true,
    stashEnabled: true,
    stageCount: 1,
    unstageCount: 0,
    discardCount: 1,
    stashCount: 1,
  };
  const onlyStaged = {
    stageEnabled: false,
    unstageEnabled: true,
    discardEnabled: false,
    stashEnabled: true,
    stageCount: 0,
    unstageCount: 1,
    discardCount: 0,
    stashCount: 1,
  };
  const nothing = {
    stageEnabled: false,
    unstageEnabled: false,
    discardEnabled: false,
    stashEnabled: false,
    stageCount: 0,
    unstageCount: 0,
    discardCount: 0,
    stashCount: 0,
  };

  it('no files → returns null regardless of previous', () => {
    expect(applyDefaultRadioRule(nothing, null)).toBeNull();
    expect(applyDefaultRadioRule(nothing, 'stash')).toBeNull();
  });

  it('Stage available, no previous → selects Stage (FR-016)', () => {
    expect(applyDefaultRadioRule(allEnabled, null)).toBe('stage');
  });

  it('Stage disabled, Unstage enabled, no previous → selects Unstage (FR-017)', () => {
    expect(applyDefaultRadioRule(onlyStaged, null)).toBe('unstage');
  });

  it('sticky: previous still enabled → keeps previous', () => {
    expect(applyDefaultRadioRule(allEnabled, 'stash')).toBe('stash');
    expect(applyDefaultRadioRule(allEnabled, 'unstage')).toBe('unstage');
    expect(applyDefaultRadioRule(allEnabled, 'discard')).toBe('discard');
  });

  it('previous no longer enabled → falls back to Stage preference', () => {
    // Previous was Unstage, but now only unstaged files → Unstage disabled
    expect(applyDefaultRadioRule(onlyUnstaged, 'unstage')).toBe('stage');
  });

  it('previous no longer enabled, Stage also disabled → falls to Unstage', () => {
    // Previous was Stage, but now only staged → Stage disabled → prefer Unstage
    expect(applyDefaultRadioRule(onlyStaged, 'stage' as ActionKind)).toBe('unstage');
  });
});
