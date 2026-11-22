/** The two event fields the check reads; a React synthetic event satisfies it. */
interface ContainmentEvent {
  currentTarget: { contains(node: Node | null): boolean };
  target: EventTarget | null;
}

/**
 * Whether an event bubbled up the **React** tree from a portal rather than from
 * the element's own DOM.
 *
 * React bubbles synthetic events through portals to their React ancestors, so a
 * click on a context-menu item or a dialog button rendered by a menu nested
 * inside a commit row reaches the row's `onClick` even though, in the DOM, the
 * menu is nowhere near the row. A handler that should react only to its own
 * content asks this first.
 */
export function isEventFromPortal(event: ContainmentEvent): boolean {
  return !event.currentTarget.contains(event.target as Node | null);
}
