import { describe, expect, it } from 'vitest';
import { nextTabIndex } from '../tabNavigation';

describe('nextTabIndex', () => {
  it('moves with the arrows and wraps at both ends', () => {
    expect(nextTabIndex(0, 3, 'ArrowRight')).toBe(1);
    expect(nextTabIndex(2, 3, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(0, 3, 'ArrowLeft')).toBe(2);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextTabIndex(1, 3, 'Home')).toBe(0);
    expect(nextTabIndex(1, 3, 'End')).toBe(2);
  });

  it('ignores other keys and empty tab lists', () => {
    expect(nextTabIndex(1, 3, 'Enter')).toBeNull();
    expect(nextTabIndex(0, 0, 'ArrowRight')).toBeNull();
  });
});
