import { describe, expect, it } from 'vitest';
import {
  DIALOG_IDS,
  TRACKED_OPERATIONS,
  UI_ACTIONS,
  UI_SURFACES,
  isValidUiTelemetryEvent,
  toCommitCountBucket,
} from '../../shared/telemetry.js';
import {
  MUTATING_OPERATIONS,
  PANEL_OPENED_TRIGGERS,
  TAB_COUNT_BUCKETS,
  toTabCountBucket,
} from '../../shared/telemetry.js';

describe('toCommitCountBucket', () => {
  it.each([
    [0, '<=500'],
    [500, '<=500'],
    [501, '501-1000'],
    [1000, '501-1000'],
    [1001, '1001-5000'],
    [5000, '1001-5000'],
    [5001, '5001-10000'],
    [10000, '5001-10000'],
    [10001, '>10000'],
  ] as const)('buckets %i as %s', (count, bucket) => {
    expect(toCommitCountBucket(count)).toBe(bucket);
  });
});

describe('TRACKED_OPERATIONS', () => {
  it('includes user-initiated operations', () => {
    expect(TRACKED_OPERATIONS.has('mergeBranch')).toBe(true);
    expect(TRACKED_OPERATIONS.has('checkoutBranch')).toBe(true);
    expect(TRACKED_OPERATIONS.has('createTag')).toBe(true);
    expect(TRACKED_OPERATIONS.has('interactiveRebase')).toBe(true);
  });

  it('includes the read-only operations a single click triggers', () => {
    // Read-only but user-initiated and potentially slow — the router's
    // `headLocationFailed` failure classification depends on this membership.
    expect(TRACKED_OPERATIONS.has('compareRefs')).toBe(true);
    expect(TRACKED_OPERATIONS.has('locateHead')).toBe(true);
  });

  it('excludes chatty/read/high-frequency request types', () => {
    expect(TRACKED_OPERATIONS.has('getCommits')).toBe(false);
    expect(TRACKED_OPERATIONS.has('loadMoreCommits')).toBe(false);
    expect(TRACKED_OPERATIONS.has('refresh')).toBe(false);
    expect(TRACKED_OPERATIONS.has('getCommitDetails')).toBe(false);
    expect(TRACKED_OPERATIONS.has('verifySignatures')).toBe(false);
    expect(TRACKED_OPERATIONS.has('copyToClipboard')).toBe(false);
    expect(TRACKED_OPERATIONS.has('updatePersistedUIState')).toBe(false);
  });
});

describe('isValidUiTelemetryEvent', () => {
  it('accepts badge checkout telemetry without allowing branch or repository details', () => {
    const event = { kind: 'uiInteraction', surface: 'branchBadge', action: 'checkoutDoubleClick' };
    expect(isValidUiTelemetryEvent(event)).toBe(true);
    expect(isValidUiTelemetryEvent({ ...event, branch: 'private-feature' })).toBe(false);
    expect(isValidUiTelemetryEvent({ ...event, repoPath: '/private/repo' })).toBe(false);
    expect(isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog: 'checkoutWorktree', outcome: 'confirmed' })).toBe(true);
  });

  it('accepts every uiInteraction surface/action combination in the catalog', () => {
    for (const surface of UI_SURFACES) {
      for (const action of UI_ACTIONS) {
        expect(isValidUiTelemetryEvent({ kind: 'uiInteraction', surface, action })).toBe(true);
      }
    }
  });

  it('accepts every dialogOutcome shape in the catalog', () => {
    for (const dialog of DIALOG_IDS) {
      expect(isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog, outcome: 'confirmed' })).toBe(true);
      expect(isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog, outcome: 'cancelled' })).toBe(true);
    }
  });

  it('accepts a valid perf event', () => {
    expect(
      isValidUiTelemetryEvent({ kind: 'perf', perfKind: 'topology', durationMs: 42.5, commitCountBucket: '<=500' }),
    ).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(isValidUiTelemetryEvent({ kind: 'operation', surface: 'toolbar', action: 'refresh' })).toBe(false);
    expect(isValidUiTelemetryEvent({ kind: 'evil' })).toBe(false);
  });

  it('rejects out-of-set surface, action, and dialog values', () => {
    expect(isValidUiTelemetryEvent({ kind: 'uiInteraction', surface: 'statusBar', action: 'refresh' })).toBe(false);
    expect(isValidUiTelemetryEvent({ kind: 'uiInteraction', surface: 'toolbar', action: 'launchMissiles' })).toBe(false);
    expect(isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog: 'notADialog', outcome: 'confirmed' })).toBe(false);
  });

  it('rejects free-string smuggling in enum fields', () => {
    expect(
      isValidUiTelemetryEvent({ kind: 'uiInteraction', surface: 'toolbar', action: '/home/user/secret-repo' }),
    ).toBe(false);
    expect(
      isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog: 'merge', outcome: 'my-branch-name' }),
    ).toBe(false);
    expect(
      isValidUiTelemetryEvent({ kind: 'perf', perfKind: 'topology', durationMs: 1, commitCountBucket: '1234' }),
    ).toBe(false);
  });

  it('rejects extra keys (strict shape)', () => {
    expect(
      isValidUiTelemetryEvent({ kind: 'uiInteraction', surface: 'toolbar', action: 'refresh', extra: 'payload' }),
    ).toBe(false);
    expect(
      isValidUiTelemetryEvent({ kind: 'dialogOutcome', dialog: 'merge', outcome: 'confirmed', branch: 'main' }),
    ).toBe(false);
    expect(
      isValidUiTelemetryEvent({
        kind: 'perf', perfKind: 'topology', durationMs: 1, commitCountBucket: '<=500', commitCount: 1234,
      }),
    ).toBe(false);
  });

  it('rejects missing keys', () => {
    expect(isValidUiTelemetryEvent({ kind: 'uiInteraction', surface: 'toolbar' })).toBe(false);
    expect(isValidUiTelemetryEvent({ kind: 'perf', perfKind: 'topology', durationMs: 1 })).toBe(false);
  });

  it('rejects negative, NaN, and Infinity durations', () => {
    for (const durationMs of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '100']) {
      expect(
        isValidUiTelemetryEvent({ kind: 'perf', perfKind: 'topology', durationMs, commitCountBucket: '<=500' }),
      ).toBe(false);
    }
  });

  it('rejects non-object input', () => {
    expect(isValidUiTelemetryEvent(null)).toBe(false);
    expect(isValidUiTelemetryEvent(undefined)).toBe(false);
    expect(isValidUiTelemetryEvent('uiInteraction')).toBe(false);
    expect(isValidUiTelemetryEvent(42)).toBe(false);
    expect(isValidUiTelemetryEvent([])).toBe(false);
  });
});

describe('toTabCountBucket', () => {
  it('buckets at the documented boundaries', () => {
    expect(toTabCountBucket(0)).toBe('1');
    expect(toTabCountBucket(1)).toBe('1');
    expect(toTabCountBucket(2)).toBe('2');
    expect(toTabCountBucket(3)).toBe('3-5');
    expect(toTabCountBucket(5)).toBe('3-5');
    expect(toTabCountBucket(6)).toBe('6+');
    expect(toTabCountBucket(50)).toBe('6+');
  });

  it('never leaks an exact count — every answer is in the closed catalog', () => {
    for (let n = 0; n <= 60; n++) {
      expect(TAB_COUNT_BUCKETS).toContain(toTabCountBucket(n));
    }
  });

  it('buckets a non-finite count rather than throwing', () => {
    expect(toTabCountBucket(Number.NaN)).toBe('1');
  });
});

describe('PANEL_OPENED_TRIGGERS', () => {
  it('covers every entry point that creates a graph tab', () => {
    expect([...PANEL_OPENED_TRIGGERS].sort()).toEqual(
      ['command', 'commandPalette', 'scmButton', 'statusBar', 'toolbarButton'].sort(),
    );
  });
});

describe('MUTATING_OPERATIONS', () => {
  it('is the tracked list minus the two read-only members, derived rather than respelled', () => {
    const missing = [...TRACKED_OPERATIONS].filter((operation) => !MUTATING_OPERATIONS.has(operation));
    expect(missing.sort()).toEqual(['compareRefs', 'locateHead']);
  });

  it('adds nothing the tracked list does not already carry', () => {
    for (const operation of MUTATING_OPERATIONS) {
      expect(TRACKED_OPERATIONS.has(operation)).toBe(true);
    }
  });
});
