/**
 * Holding back the details panel after a click on a branch badge (GH #225).
 *
 * Double-clicking a branch badge checks it out, but a double-click starts with
 * an ordinary click, and that click selects the row. The panel then opens when
 * the commit's details arrive, so a checkout used to pop the panel open as a
 * side effect. The browser cannot say on the first click whether a second will
 * follow, so the row is still selected at once (selection feedback stays
 * instant and matches clicking anywhere else on the row) and only the panel's
 * *opening* waits out the double-click window. The details request starts
 * immediately, so the wait overlaps the git round trip and mostly disappears.
 *
 * Only a closed panel is held: an open panel merely changes content, which
 * pops nothing up. A double-click slower than the window falls back to the old
 * behaviour (the panel opens and stays), never to a panel that opens and closes.
 */

/**
 * How long a closed panel waits for a possible second click. A webview cannot
 * read the OS double-click speed; a slower double-click just opens the panel.
 */
export const BADGE_DOUBLE_CLICK_WINDOW_MS = 300;

/** Set on a branch or remote-branch badge, whose double-click checks it out. */
export const CHECKOUT_BADGE_ATTRIBUTE = 'data-checkout-badge';

/**
 * `waiting`: inside the window — details that arrive are stored but do not
 * open the panel; the window's end opens it.
 * `suppressed`: a double-click came before the details did — when they
 * arrive they must not open the panel.
 */
export interface DetailsPanelHold {
  hash: string;
  phase: 'waiting' | 'suppressed';
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
  if (hold.phase === 'waiting') return { hold, open: false };
  return { hold: null, open: false };
}

/** The double-click window ended without a second click: open the panel if its details are already here. */
export function onHoldWindowElapsed(
  hold: DetailsPanelHold | null,
  hash: string,
  loadedDetailsHash: string | undefined,
): HoldTransition {
  if (hold?.hash !== hash || hold.phase !== 'waiting') return { hold, open: false };
  return { hold: null, open: loadedDetailsHash === hash };
}

/** The badge was double-clicked inside the window: the panel stays closed. */
export function onBadgeDoubleClick(
  hold: DetailsPanelHold | null,
  hash: string,
  loadedDetailsHash: string | undefined,
): DetailsPanelHold | null {
  if (hold?.hash !== hash || hold.phase !== 'waiting') return hold;
  return loadedDetailsHash === hash ? null : { hash, phase: 'suppressed' };
}
