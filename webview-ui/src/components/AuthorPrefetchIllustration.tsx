import {
  ADDED_COLOR,
  BORDER_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_GREEN_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { CheckIcon } from './icons';

const KNOWN_AUTHORS = ['Alice Chen', 'Bob Smith'] as const;

/**
 * A miniature for the 5.24.0 hero: the Filter panel's Authors row with **Me**
 * already enabled and the dropdown already filled, then a just-fetched author
 * joining the list while the selection stays ticked. Decorative only — the
 * keyframes live in `index.css` and stop under reduced motion, which leaves the
 * new author showing.
 */
export function AuthorPrefetchIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-2 text-[9px]" style={{ color: FOREGROUND_COLOR }}>
        <span style={{ color: NEUTRAL_COLOR }}>Authors</span>
        <span className="rounded border px-1.5 py-px" style={{ borderColor: BORDER_COLOR }}>
          Alice Chen ▾
        </span>
        <span
          className="ml-auto rounded px-1.5 py-px font-semibold"
          style={{ background: tint(SHOWCASE_BLUE_COLOR, 30), color: FOREGROUND_COLOR }}
        >
          Me
        </span>
      </div>

      <div
        className="space-y-0.5 border-t px-2.5 py-1.5 text-[9px]"
        style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 60), color: FOREGROUND_COLOR }}
      >
        {KNOWN_AUTHORS.map((name, index) => (
          <div key={name} className="flex items-center gap-1.5">
            <span className="w-2.5" style={{ color: ADDED_COLOR }}>
              {index === 0 && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            {name}
          </div>
        ))}
        <div className="animate-whats-new-author-join flex items-center gap-1.5">
          <span className="w-2.5" />
          Carol Diaz
          <span
            className="ml-auto rounded px-1 text-[8px]"
            style={{ background: tint(SHOWCASE_GREEN_COLOR, 25), color: SHOWCASE_GREEN_COLOR }}
          >
            new
          </span>
        </div>
      </div>
    </div>
  );
}
