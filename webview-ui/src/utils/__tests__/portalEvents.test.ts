import { describe, expect, it } from 'vitest';
import { isEventFromPortal } from '../portalEvents';

describe('isEventFromPortal', () => {
  const inside = {} as EventTarget;
  const event = (target: EventTarget) => ({
    currentTarget: { contains: (node: Node | null) => node === (inside as unknown as Node) },
    target,
  });

  it('is false for an event from the element’s own DOM', () => {
    expect(isEventFromPortal(event(inside))).toBe(false);
  });

  it('is true for an event that only bubbled through the React tree', () => {
    expect(isEventFromPortal(event({} as EventTarget))).toBe(true);
  });
});
