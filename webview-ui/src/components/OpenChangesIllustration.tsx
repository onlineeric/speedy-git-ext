import type { CSSProperties } from 'react';
import {
  ADDED_COLOR,
  BORDER_COLOR,
  DELETED_COLOR,
  FOREGROUND_COLOR,
  NEUTRAL_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { OpenChangesIcon } from './icons';

const FILES = [
  { name: 'api.ts', lines: ['deleted', 'added', 'added'] },
  { name: 'auth.ts', lines: ['added', 'deleted'] },
  { name: 'README.md', lines: ['added'] },
] as const;

/** One file of the miniature diff editor: its name, then its changed lines as bars. */
function MiniFileDiff({ name, lines, index }: { name: string; lines: readonly ('added' | 'deleted')[]; index: number }) {
  const delay = { '--whats-new-changes-delay': `${index * 0.2}s` } as CSSProperties;
  return (
    <div className="animate-whats-new-changes-file space-y-0.5" style={delay}>
      <div className="font-mono text-[8px]" style={{ color: FOREGROUND_COLOR }}>{name}</div>
      {lines.map((kind, lineIndex) => {
        const color = kind === 'added' ? ADDED_COLOR : DELETED_COLOR;
        return (
          <span
            key={lineIndex}
            className="block h-1 rounded-full"
            style={{ width: `${55 + ((lineIndex * 17) % 35)}%`, background: tint(color, 55) }}
          />
        );
      })}
    </div>
  );
}

/**
 * A miniature of the details panel's file list for the 5.22.0 hero: the Open
 * Changes button is clicked, and the multi-file diff editor opens with every file
 * stacked in it. Decorative only — the keyframes live in `index.css` and stop
 * under reduced motion, which leaves the editor open.
 */
export function OpenChangesIllustration() {
  return (
    <div
      aria-hidden
      className="w-full min-w-[15rem] overflow-hidden rounded-xl border shadow-lg"
      style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 80) }}
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-[9px]">
        <span style={{ color: ADDED_COLOR }}>Staged Changes</span>
        <span style={{ color: NEUTRAL_COLOR }}>(3)</span>
        <span className="relative ml-auto grid h-3.5 w-3.5 place-items-center" style={{ color: SHOWCASE_ORANGE_COLOR }}>
          <OpenChangesIcon size={11} />
          {/* The click: a ring that expands out of the button just before the editor opens. */}
          <span
            className="animate-whats-new-changes-click absolute inset-0 rounded-full border opacity-0 motion-reduce:hidden"
            style={{ borderColor: SHOWCASE_ORANGE_COLOR }}
          />
        </span>
      </div>

      <div
        className="animate-whats-new-changes-open space-y-1.5 border-t px-2 py-1.5"
        style={{ borderColor: BORDER_COLOR, background: tint(SURFACE_COLOR, 60) }}
      >
        <div className="text-[8px]" style={{ color: NEUTRAL_COLOR }}>Staged Changes (3 files)</div>
        {FILES.map((file, index) => (
          <MiniFileDiff key={file.name} name={file.name} lines={file.lines} index={index} />
        ))}
      </div>
    </div>
  );
}
