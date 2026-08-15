import { describe, expect, it } from 'vitest';
import {
  decideWhatsNew,
  WHATS_NEW_COUNTDOWN_SECONDS,
  WHATS_NEW_DEV_COUNTDOWN_SECONDS,
} from '../../shared/whatsNew.js';

describe('decideWhatsNew', () => {
  describe('released build', () => {
    const released = { isDevelopment: false };

    it('shows on a first install, where nothing has been stored yet', () => {
      const decision = decideWhatsNew({ ...released, currentVersion: '5.10.0', lastShownVersion: undefined });
      expect(decision).toEqual({ show: true, countdownSeconds: WHATS_NEW_COUNTDOWN_SECONDS });
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

    it('waits a shorter time, because it opens on every launch', () => {
      const decision = decideWhatsNew({
        currentVersion: '5.10.0',
        lastShownVersion: undefined,
        isDevelopment: true,
      });
      expect(decision.countdownSeconds).toBe(WHATS_NEW_DEV_COUNTDOWN_SECONDS);
      expect(WHATS_NEW_DEV_COUNTDOWN_SECONDS).toBeLessThan(WHATS_NEW_COUNTDOWN_SECONDS);
    });
  });
});
