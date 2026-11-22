/**
 * Holding back the details panel after a click on a branch badge (GH #225).
 *
 * A double-click checks the branch out, but it starts with an ordinary click,
 * which selects the row, and the panel opens when that commit's details arrive.
 * The first click cannot know a second will follow, so the row is still selected
 * at once and only a *closed* panel's opening waits out the double-click window;
 * the details request runs meanwhile, so the wait mostly disappears. A webview
 * cannot read the OS double-click speed: a slower double-click falls back to the
 * old behaviour (the panel opens and stays), never to one that opens and closes.
 */

export const BADGE_DOUBLE_CLICK_WINDOW_MS = 300;

/** Set on a branch or remote-branch badge, whose double-click checks it out. */
export const CHECKOUT_BADGE_ATTRIBUTE = 'data-checkout-badge';

/**
 * Whether a click on a checkout badge is part of the checkout gesture: a plain
 * primary-button click. The badge's double-click handler and the row's panel
 * hold both ask this, so a modifier click can never hold a panel that no
 * checkout then cancels.
 */
export function isCheckoutGesture(event: {
  button: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean;
}): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}

/**
 * `waiting`: inside the window, the requested details have not arrived yet.
 * `detailsReady`: inside the window, the requested details arrived — they are
 * stored but do not open the panel; the window's end opens it.
 * `suppressed`: a double-click came before the details did — when they
 * arrive they must not open the panel.
 *
 * Arrival is tracked here rather than read from the stored details, because
 * those can be an earlier load of the same commit (selected before, panel
 * closed since) while this click's request is still in flight.
 */
export interface DetailsPanelHold {
  hash: string;
  phase: 'waiting' | 'detailsReady' | 'suppressed';
}

/** What a plain (unmodified) row click does. */
export type RowClickAction =
  /** Select the row; the panel opens as soon as the details arrive. */
  | 'select'
  /** Select the row now, but hold the panel's opening for the double-click window. */
  | 'selectAndHold'
  /** The second click of a badge double-click: the row is already selected, and the dblclick checks out. */
  | 'badgeSecondClick';

export function decideRowClick({ onCheckoutBadge, clickCount, detailsPanelOpen }: {
  /** The click landed on a badge whose double-click checks out a branch. */
  onCheckoutBadge: boolean;
  /** `MouseEvent.detail`: 1 for a single click, 2 for the second click of a double-click. */
  clickCount: number;
  detailsPanelOpen: boolean;
}): RowClickAction {
  if (!onCheckoutBadge) return 'select';
  if (clickCount >= 2) return 'badgeSecondClick';
  return detailsPanelOpen ? 'select' : 'selectAndHold';
}

interface HoldTransition {
  hold: DetailsPanelHold | null;
  /** Whether this step opens the details panel. */
  open: boolean;
}

/** A commit's details arrived. Without a hold for that commit they open the panel, as always. */
export function onDetailsArrived(hold: DetailsPanelHold | null, detailsHash: string): HoldTransition {
  if (hold?.hash !== detailsHash) return { hold, open: true };
  if (hold.phase === 'suppressed') return { hold: null, open: false };
  return { hold: { ...hold, phase: 'detailsReady' }, open: false };
}

/**
 * The window ended without a second click: open the panel if this click's
 * details are already here. Only the latest hold has a pending window — the
 * store cancels the previous timer when it starts a new one.
 */
export function onHoldWindowElapsed(hold: DetailsPanelHold | null): HoldTransition {
  if (!hold || hold.phase === 'suppressed') return { hold, open: false };
  return { hold: null, open: hold.phase === 'detailsReady' };
}

/** The badge was double-clicked inside the window: the panel stays closed. */
export function onBadgeDoubleClick(hold: DetailsPanelHold | null, hash: string): DetailsPanelHold | null {
  if (hold?.hash !== hash || hold.phase === 'suppressed') return hold;
  return hold.phase === 'detailsReady' ? null : { ...hold, phase: 'suppressed' };
}
