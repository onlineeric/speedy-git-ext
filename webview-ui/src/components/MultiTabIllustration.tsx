import type { ReactNode } from 'react';
import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_PURPLE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { NewTabIcon } from './icons';

/** One miniature commit row; three of them stand in for a graph. */
function MiniRow({ accent, width, dim = false }: { accent: string; width: string; dim?: boolean }) {
  return (
    <div className="flex items-center gap-1" style={{ opacity: dim ? 0.55 : 1 }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
      <span className="h-1 rounded-full" style={{ width, background: tint(FOREGROUND_COLOR, 45) }} />
    </div>
  );
}

/** One editor group: its tab, then a miniature of the graph inside it. */
function MiniGroup({ title, accent, className = '' }: { title: string; accent: string; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-md border ${className}`}
      style={{ borderColor: tint(accent, 45), background: SURFACE_COLOR }}
    >
      <div
        className="flex items-center gap-1 border-b px-1.5 py-1"
        style={{ borderColor: tint(accent, 30), background: tint(accent, 14) }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: accent }} />
        <span className="truncate text-[9px] font-semibold" style={{ color: FOREGROUND_COLOR }}>
          {title}
        </span>
      </div>
      <div className="relative px-1.5 py-2">
        {/* The lane the commits sit on, behind the dots. */}
        <span
          className="absolute w-px"
          style={{ left: 8.75, top: 12, bottom: 12, background: tint(accent, 60) }}
        />
        <div className="relative space-y-1.5">
          <MiniRow accent={accent} width="60%" />
          <MiniRow accent={accent} width="80%" dim />
          <MiniRow accent={accent} width="45%" dim />
        </div>
      </div>
    </div>
  );
}

/** The toolbar's right end, with the New Tab button that opens the second group. */
function MiniToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-end gap-1.5 px-0.5" style={{ color: NEUTRAL_COLOR }}>
      {children}
    </div>
  );
}

/**
 * A miniature of the editor for the 5.17.0 hero: the real New Tab button pulses,
 * and a second graph tab opens beside the first. Decorative only — the keyframes
 * live in `index.css` and stop under reduced motion, which leaves both groups
 * showing, since two graphs side by side *is* the feature.
 */
export function MultiTabIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] rounded-xl border p-2.5 shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <MiniToolbar>
        <span className="h-1 w-4 rounded-full" style={{ background: tint(FOREGROUND_COLOR, 30) }} />
        <span className="h-1 w-3 rounded-full" style={{ background: tint(FOREGROUND_COLOR, 30) }} />
        <span className="relative grid h-4 w-4 place-items-center rounded" style={{ color: SHOWCASE_PURPLE_COLOR }}>
          <NewTabIcon className="h-3 w-3" />
          {/* The click: a ring that expands out of the button just before the split. */}
          <span
            className="animate-whats-new-newtab absolute inset-0 rounded-full border motion-reduce:hidden"
            style={{ borderColor: SHOWCASE_PURPLE_COLOR }}
          />
        </span>
      </MiniToolbar>

      <div className="grid grid-cols-2 gap-1.5">
        <MiniGroup title="web-app" accent={SHOWCASE_BLUE_COLOR} />
        <MiniGroup title="sub-mod1" accent={SHOWCASE_PURPLE_COLOR} className="animate-whats-new-split" />
      </div>
    </div>
  );
}
