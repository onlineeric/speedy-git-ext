import {
  ADDED_COLOR,
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { BranchIcon, CheckIcon } from './icons';

const ROW_BAR_WIDTHS = ['70%', '55%', '62%'] as const;
const BADGE_ROW = 1;
const MENU_ITEMS = ['Checkout feature', 'Rename Branch...', 'Copy Branch Name'] as const;
const CLICKED_ITEM = MENU_ITEMS.length - 1;

/**
 * A miniature for the 5.25.0 hero: a branch badge's right-click menu runs
 * **Copy Branch Name**, the badge reports "copied", and the details panel below
 * stays closed, leaving the graph its full height. Decorative only — the
 * keyframes live in `index.css` and stop under reduced motion, which leaves the
 * menu and the "copied" mark showing.
 */
export function QuietMenusIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="relative space-y-1 px-2.5 py-2 text-[9px]" style={{ color: FOREGROUND_COLOR }}>
        {ROW_BAR_WIDTHS.map((width, index) => (
          <div key={index} className="flex h-3.5 items-center gap-1.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_BLUE_COLOR }} />
            {index === BADGE_ROW && (
              <>
                <span
                  className="inline-flex shrink-0 items-center gap-0.5 rounded border px-1"
                  style={{ borderColor: SHOWCASE_BLUE_COLOR, background: tint(SHOWCASE_BLUE_COLOR, 20) }}
                >
                  <BranchIcon className="h-2 w-2" />
                  feature
                </span>
                <span className="animate-whats-new-menu-done inline-flex shrink-0 items-center gap-0.5" style={{ color: ADDED_COLOR }}>
                  <CheckIcon className="h-2 w-2" />
                  copied
                </span>
              </>
            )}
            <span className="block h-1 rounded-full" style={{ width, background: tint(NEUTRAL_COLOR, 35) }} />
          </div>
        ))}

        <div
          className="animate-whats-new-menu-open absolute left-16 top-8 z-10 rounded border py-0.5 shadow-lg"
          style={{ borderColor: BORDER_COLOR, background: SURFACE_COLOR }}
        >
          {MENU_ITEMS.map((item, index) => (
            <div
              key={item}
              className="relative px-2 py-px"
              style={index === CLICKED_ITEM ? { background: tint(SHOWCASE_ORANGE_COLOR, 25) } : undefined}
            >
              {item}
              {index === CLICKED_ITEM && (
                <span
                  className="animate-whats-new-autolink-click absolute inset-0 rounded border opacity-0 motion-reduce:hidden"
                  style={{ borderColor: SHOWCASE_ORANGE_COLOR }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className="border-t border-dashed px-2.5 py-1 text-center text-[8px]"
        style={{ borderColor: BORDER_COLOR, color: NEUTRAL_COLOR }}
      >
        Details panel stays closed
      </div>
    </div>
  );
}
