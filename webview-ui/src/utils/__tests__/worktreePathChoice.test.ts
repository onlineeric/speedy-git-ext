import { describe, it, expect } from 'vitest';
import {
  computedPathFor,
  decideStyleSwitch,
  isPathEdited,
  saveDefaultLink,
  WORKTREE_STYLE_LABELS,
  type ResolvedWorktreePaths,
} from '../worktreePathChoice';

const resolved: ResolvedWorktreePaths = {
  nestedPath: '/wt/feat/branch1',
  flatPath: '/wt/feat-branch1',
  hierarchical: true,
};

describe('computedPathFor', () => {
  it('returns the path for the given style', () => {
    expect(computedPathFor(resolved, 'nested')).toBe('/wt/feat/branch1');
    expect(computedPathFor(resolved, 'flat')).toBe('/wt/feat-branch1');
  });

  it('is empty before anything has been resolved', () => {
    expect(computedPathFor(null, 'nested')).toBe('');
  });
});

describe('isPathEdited', () => {
  it('is false for an untouched box', () => {
    expect(isPathEdited('/wt/feat/branch1', '/wt/feat/branch1')).toBe(false);
  });

  it('is false after typing and undoing, since only the text is compared', () => {
    const computed = '/wt/feat/branch1';
    let text = computed;
    text += '-x';
    expect(isPathEdited(text, computed)).toBe(true);
    text = text.slice(0, -2);
    expect(isPathEdited(text, computed)).toBe(false);
  });

  it('is true for a genuinely changed path', () => {
    expect(isPathEdited('/somewhere/else', '/wt/feat/branch1')).toBe(true);
  });
});

describe('decideStyleSwitch', () => {
  it('ignores a re-click on the already-selected style', () => {
    expect(
      decideStyleSwitch({
        current: 'nested',
        next: 'nested',
        currentText: '/edited',
        computed: '/wt/feat/branch1',
      }),
    ).toBe('ignore');
  });

  it('switches silently when the selected box holds no edit', () => {
    expect(
      decideStyleSwitch({
        current: 'nested',
        next: 'flat',
        currentText: '/wt/feat/branch1',
        computed: '/wt/feat/branch1',
      }),
    ).toBe('switch');
  });

  it('asks before discarding an edited path', () => {
    expect(
      decideStyleSwitch({
        current: 'nested',
        next: 'flat',
        currentText: '/wt/my-own-place',
        computed: '/wt/feat/branch1',
      }),
    ).toBe('confirm');
  });
});

describe('saveDefaultLink', () => {
  it('is hidden when the choice does not apply', () => {
    expect(saveDefaultLink({ hierarchical: false, selected: 'flat', configured: 'nested' }).visible).toBe(false);
  });

  it('is hidden when the selection already matches the configured style', () => {
    expect(saveDefaultLink({ hierarchical: true, selected: 'nested', configured: 'nested' }).visible).toBe(false);
  });

  it('is visible and names the style when the selection differs', () => {
    expect(saveDefaultLink({ hierarchical: true, selected: 'flat', configured: 'nested' })).toEqual({
      visible: true,
      label: `Use ${WORKTREE_STYLE_LABELS.flat} by default`,
    });
    expect(saveDefaultLink({ hierarchical: true, selected: 'nested', configured: 'flat' })).toEqual({
      visible: true,
      label: `Use ${WORKTREE_STYLE_LABELS.nested} by default`,
    });
  });
});
