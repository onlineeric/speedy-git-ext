import {
  ADDED_COLOR,
  BORDER_COLOR,
  ERROR_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_BLUE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { CheckIcon } from './icons';

/** Where the old 60-second limit sits on the progress track, in percent. */
const OLD_LIMIT_PERCENT = 30;

/**
 * A miniature for the 5.23.0 hero: a slow push runs straight past where the old
 * 60-second limit used to stop it and finishes, with the Git tab's timeout box
 * below it. Decorative only — the keyframes live in `index.css` and stop under
 * reduced motion, which leaves the push finished.
 */
export function GitTimeoutIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="space-y-1.5 px-2.5 py-2">
        <div className="flex items-center gap-1.5 font-mono text-[9px]" style={{ color: FOREGROUND_COLOR }}>
          <span>git push --force</span>
          <span className="animate-whats-new-timeout-done ml-auto flex items-center gap-0.5" style={{ color: ADDED_COLOR }}>
            <CheckIcon className="h-2.5 w-2.5" />
            done
          </span>
        </div>

        <div className="relative h-1.5 rounded-full" style={{ background: tint(NEUTRAL_COLOR, 25) }}>
          <span
            className="animate-whats-new-timeout-bar absolute inset-y-0 left-0 w-full origin-left rounded-full"
            style={{ background: SHOWCASE_BLUE_COLOR }}
          />
          {/* The old limit: where the push used to be killed. */}
          <span
            className="absolute -top-1 -bottom-1 w-px"
            style={{ left: `${OLD_LIMIT_PERCENT}%`, background: ERROR_COLOR }}
          />
        </div>
        <div className="relative h-2.5 text-[8px]" style={{ color: ERROR_COLOR }}>
          <span className="absolute -translate-x-1/2 line-through" style={{ left: `${OLD_LIMIT_PERCENT}%` }}>
            60s
          </span>
        </div>
      </div>

      <div
        className="flex items-center gap-1.5 border-t px-2.5 py-1.5 text-[9px]"
        style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 60), color: FOREGROUND_COLOR }}
      >
        <span>Git command timeout</span>
        <span
          className="ml-auto rounded border px-1.5 py-px text-right font-mono"
          style={{ borderColor: SHOWCASE_BLUE_COLOR, minWidth: '2.25rem' }}
        >
          300
        </span>
        <span style={{ color: NEUTRAL_COLOR }}>seconds</span>
      </div>
    </div>
  );
}
