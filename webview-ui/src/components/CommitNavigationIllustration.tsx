import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { GoToHeadIcon } from './icons';

/** One miniature commit row: a dot on the lane and a bar standing in for the message. */
function MiniRow({ width, highlight }: { width: string; highlight?: 'from' | 'to' }) {
  return (
    <div className="relative flex h-3.5 items-center gap-1.5 px-1.5">
      {/* The selected-row wash. `from` is where the loop starts and `to` where the
          click lands; with no animation only `to` shows, since arriving is the feature. */}
      {highlight === 'from' && (
        <span
          className="animate-whats-new-nav-from absolute inset-0 rounded-sm opacity-0"
          style={{ background: tint(SHOWCASE_BLUE_COLOR, 28) }}
        />
      )}
      {highlight === 'to' && (
        <span
          className="animate-whats-new-nav-to absolute inset-0 rounded-sm"
          style={{ background: tint(SHOWCASE_ORANGE_COLOR, 30) }}
        />
      )}
      <span className="relative h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_BLUE_COLOR }} />
      <span className="relative h-1 rounded-full" style={{ width, background: tint(FOREGROUND_COLOR, 45) }} />
    </div>
  );
}

/**
 * A miniature of the graph above the details panel for the 5.18.0 hero: the
 * "Go to parent commit" icon is clicked, and the selection jumps down the lane
 * to the parent and flashes, the way the real navigation does. Decorative only —
 * the keyframes live in `index.css` and stop under reduced motion, which leaves
 * the parent selected.
 */
export function CommitNavigationIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="relative py-1.5">
        {/* The lane the commits sit on, behind the dots. */}
        <span className="absolute w-px" style={{ left: 8.75, top: 12, bottom: 12, background: tint(SHOWCASE_BLUE_COLOR, 60) }} />
        <MiniRow width="55%" />
        <MiniRow width="70%" highlight="from" />
        <MiniRow width="40%" />
        <MiniRow width="62%" highlight="to" />
      </div>

      <div
        className="space-y-1 border-t px-2 py-1.5 font-mono text-[9px]"
        style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 60) }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-9 font-sans" style={{ color: NEUTRAL_COLOR }}>Parent:</span>
          <span style={{ color: FOREGROUND_COLOR }}>a895908</span>
          <span className="relative grid h-3.5 w-3.5 place-items-center" style={{ color: SHOWCASE_ORANGE_COLOR }}>
            <GoToHeadIcon className="h-2.5 w-2.5" />
            {/* The click: a ring that expands out of the icon just before the jump. */}
            <span
              className="animate-whats-new-nav-click absolute inset-0 rounded-full border opacity-0 motion-reduce:hidden"
              style={{ borderColor: SHOWCASE_ORANGE_COLOR }}
            />
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-9 font-sans" style={{ color: NEUTRAL_COLOR }}>Child:</span>
          <span style={{ color: FOREGROUND_COLOR }}>aa54e9f</span>
          <span className="grid h-3.5 w-3.5 place-items-center" style={{ color: NEUTRAL_COLOR }}>
            <GoToHeadIcon className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
