import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_GREEN_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';

/** A reference in the miniature message: plain text that turns into a link. */
function MiniReference({ text, delaySeconds }: { text: string; delaySeconds: number }) {
  return (
    <span
      className="animate-whats-new-autolink rounded-sm px-0.5 underline underline-offset-2"
      style={{ color: SHOWCASE_BLUE_COLOR, animationDelay: `${delaySeconds}s` }}
    >
      {text}
    </span>
  );
}

/**
 * A miniature commit row for the 5.19.0 hero: the Jira key and the issue number
 * in its message light up as links one after the other, the Jira one is
 * clicked, and a browser tab with the ticket pops up. Decorative only — the
 * keyframes live in `index.css` and stop under reduced motion, which leaves both
 * references showing as links.
 */
export function AutolinksIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="relative space-y-1 px-2 py-2 font-mono text-[10px]">
        <div className="flex items-center gap-1.5 opacity-60">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_GREEN_COLOR }} />
          <span className="h-1 w-3/5 rounded-full" style={{ background: tint(FOREGROUND_COLOR, 45) }} />
        </div>

        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_GREEN_COLOR }} />
          <span className="relative">
            <MiniReference text="ABCD-123" delaySeconds={0} />
            {/* The click: a ring expanding out of the Jira link. */}
            <span
              className="animate-whats-new-autolink-click absolute inset-0 rounded opacity-0 motion-reduce:hidden"
              style={{ boxShadow: `0 0 0 1.5px ${SHOWCASE_ORANGE_COLOR}` }}
            />
          </span>
          <span style={{ color: FOREGROUND_COLOR }}>Fix login</span>
          <span style={{ color: NEUTRAL_COLOR }}>(</span>
          <MiniReference text="#86" delaySeconds={0.4} />
          <span style={{ color: NEUTRAL_COLOR }}>)</span>
        </div>

        <div className="flex items-center gap-1.5 opacity-60">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SHOWCASE_GREEN_COLOR }} />
          <span className="h-1 w-2/5 rounded-full" style={{ background: tint(FOREGROUND_COLOR, 45) }} />
        </div>
      </div>

      {/* The ticket the click opened, in the user's browser. */}
      <div
        className="animate-whats-new-autolink-open flex items-center gap-1.5 border-t px-2 py-1.5 text-[9px] opacity-0 motion-reduce:hidden"
        style={{ borderColor: BORDER_COLOR, background: tint(SHOWCASE_ORANGE_COLOR, 14), color: FOREGROUND_COLOR }}
      >
        <span className="font-bold" style={{ color: SHOWCASE_ORANGE_COLOR }}>↗</span>
        <span className="truncate font-mono">jira.example.com/browse/ABCD-123</span>
      </div>
    </div>
  );
}
