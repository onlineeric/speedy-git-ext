import { describe, expect, it } from 'vitest';
import {
  buildWhatsNewPayload,
  chooseUnseenWhatsNewEntry,
  isExactVersion,
  resolveWhatsNewEntry,
  shouldRecordWhatsNew,
  WHATS_NEW_COUNTDOWN_SECONDS,
} from '../../shared/whatsNew.js';

describe('buildWhatsNewPayload', () => {
  it('hands the stored entry version to the webview in a released build', () => {
    const payload = buildWhatsNewPayload({ currentVersion: '5.18.1', storedVersion: '5.18.0', isDevelopment: false });
    expect(payload).toEqual({
      version: '5.18.1',
      lastShownVersion: '5.18.0',
      countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS,
    });
  });

  it('withholds the stored version in development, so the dialog shows on every launch', () => {
    const payload = buildWhatsNewPayload({ currentVersion: '5.18.0', storedVersion: '5.18.0', isDevelopment: true });
    expect(payload.lastShownVersion).toBeUndefined();
  });

  it('waits the same time in development as in a released build — one countdown for every build', () => {
    const payload = buildWhatsNewPayload({ currentVersion: '5.18.0', storedVersion: undefined, isDevelopment: true });
    expect(payload.countdownSeconds).toBe(WHATS_NEW_COUNTDOWN_SECONDS);
  });
});

describe('shouldRecordWhatsNew', () => {
  it('records a dismissal in a released build, so the dialog shows once', () => {
    expect(shouldRecordWhatsNew(false)).toBe(true);
  });

  it('records nothing in development, which shares globalState with the installed extension', () => {
    expect(shouldRecordWhatsNew(true)).toBe(false);
  });
});

describe('isExactVersion', () => {
  it('accepts N.N.N and nothing else', () => {
    expect(isExactVersion('5.18.1')).toBe(true);
    expect(isExactVersion('v5.18.1')).toBe(false);
    expect(isExactVersion('5.18')).toBe(false);
    expect(isExactVersion('5.18.1-beta')).toBe(false);
    expect(isExactVersion('')).toBe(false);
  });
});

const asEntries = (versions: string[]) => versions.map((version) => ({ version }));
const resolveVersion = (currentVersion: string, versions: string[]) =>
  resolveWhatsNewEntry(currentVersion, asEntries(versions))?.version;

describe('resolveWhatsNewEntry', () => {
  const entries = ['5.18.0', '5.17.0', '5.10.1', '5.10.0'];

  it('uses the exact entry when the running version has one', () => {
    expect(resolveVersion('5.18.0', entries)).toBe('5.18.0');
  });

  it("falls back to its series' notes for a patch with none of its own", () => {
    expect(resolveVersion('5.18.1', entries)).toBe('5.18.0');
    expect(resolveVersion('5.18.7', entries)).toBe('5.18.0');
  });

  it("lets a patch with its own entry take over from its series' earlier notes", () => {
    expect(resolveVersion('5.10.0', entries)).toBe('5.10.0');
    expect(resolveVersion('5.10.1', entries)).toBe('5.10.1');
    expect(resolveVersion('5.10.4', entries)).toBe('5.10.1');
  });

  it('never borrows from another series, whichever side', () => {
    expect(resolveVersion('5.19.0', entries)).toBeUndefined();
    expect(resolveVersion('6.18.0', entries)).toBeUndefined();
    expect(resolveVersion('5.9.3', entries)).toBeUndefined();
  });

  it('never uses a later patch than the one running', () => {
    expect(resolveVersion('5.10.0', ['5.10.1'])).toBeUndefined();
  });

  it('does not depend on entry order', () => {
    expect(resolveVersion('5.10.3', ['5.10.1', '5.10.2', '5.10.0'])).toBe('5.10.2');
  });

  it('resolves nothing for a version that is not exact', () => {
    expect(resolveVersion('', entries)).toBeUndefined();
    expect(resolveVersion('5.18.1-beta', entries)).toBeUndefined();
  });
});

describe('chooseUnseenWhatsNewEntry', () => {
  const entries = asEntries(['5.18.0', '5.17.0', '5.10.1', '5.10.0']);
  const choose = (version: string, lastShownVersion: string | undefined) =>
    chooseUnseenWhatsNewEntry({ version, lastShownVersion }, entries)?.version;

  it('shows 5.18.0 on the upgrade to it, then never again on 5.18.0', () => {
    expect(choose('5.18.0', '5.17.0')).toBe('5.18.0');
    expect(choose('5.18.0', '5.18.0')).toBeUndefined();
  });

  it('stays quiet on 5.18.1 once 5.18.0 was seen', () => {
    expect(choose('5.18.1', '5.18.0')).toBeUndefined();
  });

  it("shows 5.18.0's notes to a user jumping from 5.17 straight to 5.18.1, and not again on 5.18.2", () => {
    expect(choose('5.18.1', '5.17.0')).toBe('5.18.0');
    expect(choose('5.18.2', '5.18.0')).toBeUndefined();
  });

  it('shows on a first install of a patch release', () => {
    expect(choose('5.18.1', undefined)).toBe('5.18.0');
  });

  it("still shows a patch's own entry to a user who saw its series' earlier notes", () => {
    expect(choose('5.10.1', '5.10.0')).toBe('5.10.1');
  });

  it('shows again after a downgrade to another series', () => {
    expect(choose('5.17.0', '5.18.0')).toBe('5.17.0');
  });

  it('shows nothing for a series without notes', () => {
    expect(choose('5.19.0', '5.18.0')).toBeUndefined();
  });
});
