import { describe, expect, it } from 'vitest';
import {
  chooseWhatsNewEntryVersion,
  decideWhatsNew,
  isExactVersion,
  resolveWhatsNewEntryVersion,
  shouldRecordWhatsNew,
  WHATS_NEW_COUNTDOWN_SECONDS,
} from '../../shared/whatsNew.js';

describe('decideWhatsNew', () => {
  describe('released build', () => {
    const released = { isDevelopment: false };

    it('shows on a first install, where nothing has been stored yet', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.10.0', lastShownVersion: undefined });
      expect(decision).toEqual({
        show: true,
        countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS,
        lastShownVersion: undefined,
      });
    });

    it('shows after an upgrade', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.10.0', lastShownVersion: '5.9.2' });
      expect(decision.show).toBe(true);
    });

    it('shows after a downgrade, since any change in version is a change', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.9.2', lastShownVersion: '5.10.0' });
      expect(decision.show).toBe(true);
    });

    it('stays quiet on every later run of the same version', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.10.0', lastShownVersion: '5.10.0' });
      expect(decision.show).toBe(false);
    });

    it('passes the stored entry version on, so the webview can tell a patch its notes were seen', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.18.1', lastShownVersion: '5.18.0' });
      expect(decision).toMatchObject({ show: true, lastShownVersion: '5.18.0' });
    });
  });

  describe('development', () => {
    it('always shows, so content changes can be seen by relaunching', () => {
      const decision = decideWhatsNew({
        currentVersion: '5.10.0',
        lastShownVersion: '5.10.0',
        isDevelopment: true,
      });
      expect(decision.show).toBe(true);
    });

    it('withholds the stored entry version, so nothing the webview compares can suppress the dialog', () => {
      const decision = decideWhatsNew({
        currentVersion: '5.18.1',
        lastShownVersion: '5.18.0',
        isDevelopment: true,
      });
      expect(decision.lastShownVersion).toBeUndefined();
    });

    it('waits the same time as a released build — one countdown for every build', () => {
      const decision = decideWhatsNew({
        currentVersion: '5.10.0',
        lastShownVersion: undefined,
        isDevelopment: true,
      });
      expect(decision.countdownSeconds).toBe(WHATS_NEW_COUNTDOWN_SECONDS);
    });
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

describe('resolveWhatsNewEntryVersion', () => {
  const entries = ['5.18.0', '5.17.0', '5.10.1', '5.10.0'];

  it('uses the exact entry when the running version has one', () => {
    expect(resolveWhatsNewEntryVersion('5.18.0', entries)).toBe('5.18.0');
  });

  it("falls back to its series' notes for a patch with none of its own", () => {
    expect(resolveWhatsNewEntryVersion('5.18.1', entries)).toBe('5.18.0');
    expect(resolveWhatsNewEntryVersion('5.18.7', entries)).toBe('5.18.0');
  });

  it("lets a patch with its own entry take over from its series' earlier notes", () => {
    expect(resolveWhatsNewEntryVersion('5.10.0', entries)).toBe('5.10.0');
    expect(resolveWhatsNewEntryVersion('5.10.1', entries)).toBe('5.10.1');
    expect(resolveWhatsNewEntryVersion('5.10.4', entries)).toBe('5.10.1');
  });

  it('never borrows from another series, whichever side', () => {
    expect(resolveWhatsNewEntryVersion('5.19.0', entries)).toBeUndefined();
    expect(resolveWhatsNewEntryVersion('6.18.0', entries)).toBeUndefined();
    expect(resolveWhatsNewEntryVersion('5.9.3', entries)).toBeUndefined();
  });

  it('never uses a later patch than the one running', () => {
    expect(resolveWhatsNewEntryVersion('5.10.0', ['5.10.1'])).toBeUndefined();
  });

  it('does not depend on entry order', () => {
    expect(resolveWhatsNewEntryVersion('5.10.3', ['5.10.1', '5.10.2', '5.10.0'])).toBe('5.10.2');
  });

  it('resolves nothing for a version that is not exact', () => {
    expect(resolveWhatsNewEntryVersion('', entries)).toBeUndefined();
    expect(resolveWhatsNewEntryVersion('5.18.1-beta', entries)).toBeUndefined();
  });
});

describe('chooseWhatsNewEntryVersion', () => {
  const entryVersions = ['5.18.0', '5.17.0', '5.10.1', '5.10.0'];
  const choose = (currentVersion: string, lastShownVersion: string | undefined) =>
    chooseWhatsNewEntryVersion({ currentVersion, lastShownVersion, entryVersions });

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
