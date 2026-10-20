import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_GREEN_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';

/** One miniature commit row: a dot on the lane, an optional branch badge, and a bar standing in for the message. */
function MiniRow({ width, badge, dimmed = false }: { width: string; badge?: string; dimmed?: boolean }) {
  return (
    <div className="relative flex h-3.5 items-center gap-1.5 px-1.5">
      <span className="relative h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_BLUE_COLOR }} />
      {badge && (
        <span
          className="relative shrink-0 rounded-sm px-1 font-mono text-[8px] leading-[10px]"
          style={{ color: SHOWCASE_GREEN_COLOR, background: tint(SHOWCASE_GREEN_COLOR, 22) }}
        >
          {badge}
        </span>
      )}
      <span
        className={`relative h-1 rounded-full${dimmed ? ' opacity-60' : ''}`}
        style={{ width, background: tint(FOREGROUND_COLOR, dimmed ? 30 : 45) }}
      />
    </div>
  );
}

/**
 * A miniature of the Filter panel over the graph for the 5.20.0 hero: the graph
 * is filtered to the user's own commits, "Always show badged commits" gets ticked,
 * and the tip of `main` — someone else's commit — slides back in, dimmed except
 * for its badge. Decorative only — the keyframes live in `index.css` and stop
 * under reduced motion, which leaves the option ticked and the tip shown.
 */
export function BadgedCommitsIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div
        className="space-y-1 border-b px-2 py-1.5 text-[9px]"
        style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 60) }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-9" style={{ color: NEUTRAL_COLOR }}>Authors</span>
          <span className="rounded-sm px-1" style={{ color: FOREGROUND_COLOR, background: tint(SHOWCASE_BLUE_COLOR, 22) }}>
            Me
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-9" />
          <span
            className="relative grid h-2.5 w-2.5 place-items-center rounded-[2px] border"
            style={{ borderColor: SHOWCASE_BLUE_COLOR }}
          >
            {/* The tick: drawn, then the hidden tip slides back in below. */}
            <span
              className="animate-whats-new-badged-check text-[8px] leading-none"
              style={{ color: SHOWCASE_BLUE_COLOR }}
            >
              ✓
            </span>
          </span>
          <span style={{ color: FOREGROUND_COLOR }}>Always show badged commits</span>
        </div>
      </div>

      <div className="relative py-1.5">
        {/* The lane the commits sit on, behind the dots. */}
        <span className="absolute w-px" style={{ left: 8.75, top: 12, bottom: 12, background: tint(SHOWCASE_BLUE_COLOR, 60) }} />
        <MiniRow width="58%" />
        <div className="animate-whats-new-badged-row overflow-hidden">
          <MiniRow width="44%" badge="main" dimmed />
        </div>
        <MiniRow width="70%" />
        <MiniRow width="50%" />
      </div>
    </div>
  );
}
