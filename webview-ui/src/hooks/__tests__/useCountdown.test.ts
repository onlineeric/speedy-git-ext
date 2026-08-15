import { describe, expect, it } from 'vitest';
import { remainingSeconds } from '../useCountdown';

describe('remainingSeconds', () => {
  const start = 1_000_000;
  const seconds = 5;
  const deadline = start + seconds * 1000;

  it('shows the full wait at the moment the countdown starts', () => {
    expect(remainingSeconds(deadline, start, seconds)).toBe(5);
  });

  it('rounds up, so a partly-elapsed second still reads as that second', () => {
    expect(remainingSeconds(deadline, start + 1, seconds)).toBe(5);
    expect(remainingSeconds(deadline, start + 1500, seconds)).toBe(4);
  });

  it('counts down one per second', () => {
    const seen = [0, 1, 2, 3, 4].map((elapsed) =>
      remainingSeconds(deadline, start + elapsed * 1000, seconds),
    );
    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });

  it('reaches zero at the deadline and never goes below it', () => {
    expect(remainingSeconds(deadline, deadline, seconds)).toBe(0);
    expect(remainingSeconds(deadline, deadline + 60_000, seconds)).toBe(0);
  });

  it('never exceeds the starting value, even reading a clock from before the start', () => {
    expect(remainingSeconds(deadline, start - 3000, seconds)).toBe(5);
  });
});
