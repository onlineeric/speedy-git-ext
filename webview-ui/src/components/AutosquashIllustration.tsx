import type { CSSProperties, ReactNode } from 'react';
import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  ON_ACCENT_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_GREEN_COLOR,
  SHOWCASE_PURPLE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';

/** Matches the graph's own row height, and the 56px (two rows) the fold keyframes travel. */
const ROW_HEIGHT = 28;

function CommitDot({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={hollow ? { boxShadow: `inset 0 0 0 2px ${color}`, background: SURFACE_COLOR } : { background: color }}
    />
  );
}

function Row({ top, className = '', style, children }: { top: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-x-0 flex items-center gap-2 rounded-md px-1.5 ${className}`}
      style={{ top, height: ROW_HEIGHT - 4, marginTop: 2, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * A three-row miniature of the graph, for the 5.16.0 hero: the `fixup!` commit on
 * top drops onto the commit it targets and folds into it. Decorative only — the
 * keyframes live in `index.css` and stop under reduced motion, leaving the
 * "before" picture.
 */
export function AutosquashIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] rounded-xl border p-3 font-mono text-[11px] shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="relative" style={{ height: ROW_HEIGHT * 3 }}>
        {/* The lane the three commits sit on. */}
        <span
          className="absolute w-0.5 rounded-full"
          style={{ left: 10, top: ROW_HEIGHT / 2, bottom: ROW_HEIGHT / 2, background: tint(SHOWCASE_BLUE_COLOR, 70) }}
        />

        <Row top={ROW_HEIGHT} style={{ color: NEUTRAL_COLOR }}>
          <CommitDot color={SHOWCASE_BLUE_COLOR} />
          <span className="truncate">Update README</span>
        </Row>

        <Row top={ROW_HEIGHT * 2} className="animate-whats-new-target" style={{ color: FOREGROUND_COLOR }}>
          <CommitDot color={SHOWCASE_BLUE_COLOR} />
          <span className="truncate">Add login form</span>
          <span
            className="animate-whats-new-folded ml-auto shrink-0 rounded-full px-1.5 py-px font-sans text-[10px] font-semibold motion-reduce:hidden"
            style={{ background: SHOWCASE_GREEN_COLOR, color: ON_ACCENT_COLOR }}
          >
            ✓ folded
          </span>
        </Row>

        {/* Last so it floats over the rows it passes. */}
        <Row
          top={0}
          className="animate-whats-new-fold border shadow-md"
          style={{ borderColor: tint(SHOWCASE_PURPLE_COLOR, 60), background: SURFACE_COLOR, color: FOREGROUND_COLOR }}
        >
          <CommitDot color={SHOWCASE_PURPLE_COLOR} hollow />
          <span className="truncate">
            <span style={{ color: SHOWCASE_PURPLE_COLOR }}>fixup!</span> Add login form
          </span>
        </Row>
      </div>
    </div>
  );
}
