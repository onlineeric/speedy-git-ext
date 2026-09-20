import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebouncerByKey } from '../utils/debounceByKey.js';

const OPTIONS = { debounceMs: 1000, minIntervalMs: 2000 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('DebouncerByKey', () => {
  it('fires once after the debounce window', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    debouncer.schedule('a');
    vi.advanceTimersByTime(999);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledExactlyOnceWith('a');
  });

  it('coalesces a storm of schedules into one fire', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    for (let i = 0; i < 20; i++) {
      debouncer.schedule('a');
      vi.advanceTimersByTime(100);
    }
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it('keeps keys independent — a storm in one never delays the other', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    debouncer.schedule('a');
    vi.advanceTimersByTime(500);
    debouncer.schedule('a');
    debouncer.schedule('b');
    vi.advanceTimersByTime(1000);

    expect(fire.mock.calls.map(([key]) => key).sort()).toEqual(['a', 'b']);
  });

  it('applies the minimum interval after a fire', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    debouncer.schedule('a');
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);

    // Immediately afterwards the wait is the full minimum interval, not the
    // shorter debounce.
    debouncer.schedule('a');
    vi.advanceTimersByTime(1999);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(2);
  });

  it('cancel stops a pending fire', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    debouncer.schedule('a');
    debouncer.cancel('a');
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
  });

  it('dispose stops every pending fire', () => {
    const fire = vi.fn();
    const debouncer = new DebouncerByKey<string>(OPTIONS, fire);

    debouncer.schedule('a');
    debouncer.schedule('b');
    debouncer.dispose();
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
  });
});
