interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Git branch fork shape — 12×12, inherits text color via currentColor */
export function BranchIcon({ className }: IconProps) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* Node at top (branch point) */}
      <circle cx={3} cy={2} r={1.5} fill="currentColor" />
      {/* Node at bottom-left (main trunk) */}
      <circle cx={3} cy={10} r={1.5} fill="currentColor" />
      {/* Node at top-right (branch tip) */}
      <circle cx={9} cy={4} r={1.5} fill="currentColor" />
      {/* Trunk line */}
      <line x1={3} y1={3.5} x2={3} y2={8.5} stroke="currentColor" strokeWidth={1.5} />
      {/* Branch curve from trunk to branch tip */}
      <path d="M 3 3.5 Q 3 4 9 4" stroke="currentColor" strokeWidth={1.5} fill="none" />
    </svg>
  );
}

/** Diamond/tag shape — 12×12, inherits text color via currentColor */
export function TagIcon({ className }: IconProps) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* Tag label shape: rectangle with a pointed left side */}
      <path
        d="M 2 6 L 4 3 L 10 3 L 10 9 L 4 9 Z"
        fill="currentColor"
        fillOpacity={0.3}
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Small circle hole on the left (tag hole) */}
      <circle cx={4.5} cy={6} r={1} fill="currentColor" />
    </svg>
  );
}

/** Clipboard/copy icon — 12×12, inherits text color via currentColor */
export function CopyIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <rect x={4} y={4} width={6.5} height={7} rx={1} stroke="currentColor" strokeWidth={1.2} />
      <path d="M 8 4 V 2 C 8 1.45 7.55 1 7 1 H 2.5 C 1.95 1 1.5 1.45 1.5 2 V 8.5 C 1.5 9.05 1.95 9.5 2.5 9.5 H 4" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}

/** Checkmark icon — 12×12, inherits text color via currentColor */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 2.5 6 L 5 8.5 L 9.5 3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Document icon (open file) — 12×12, inherits text color via currentColor */
export function FileIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 2.5 1.5 H 7 L 9.5 4 V 10.5 H 2.5 Z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M 7 1.5 V 4 H 9.5" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}

/** Document with code brackets (file at revision) — 12×12, inherits text color via currentColor */
export function FileCodeIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 2.5 1.5 H 7 L 9.5 4 V 10.5 H 2.5 Z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M 7 1.5 V 4 H 9.5" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M 5.5 6.5 L 4 7.5 L 5.5 8.5" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 7 6.5 L 8.5 7.5 L 7 8.5" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal lines (list view toggle) — 12×12, inherits text color via currentColor */
export function ListViewIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <line x1={1} y1={3} x2={11} y2={3} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={1} y1={6} x2={11} y2={6} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={1} y1={9} x2={11} y2={9} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}

/** Tree hierarchy (tree view toggle) — 12×12, inherits text color via currentColor */
export function TreeViewIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <line x1={2} y1={2} x2={2} y2={10} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={2} y1={3.5} x2={5} y2={3.5} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={2} y1={6.5} x2={5} y2={6.5} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={2} y1={9.5} x2={5} y2={9.5} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <rect x={5.5} y={2} width={5} height={3} rx={0.5} stroke="currentColor" strokeWidth={1} />
      <rect x={5.5} y={5} width={5} height={3} rx={0.5} stroke="currentColor" strokeWidth={1} />
      <rect x={5.5} y={8} width={5} height={3} rx={0.5} stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}

/** Filled target/bullseye for HEAD indicator — 12×12, inherits text color via currentColor */
export function HeadIcon({ className, style }: IconProps) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      style={style}
      aria-hidden
    >
      {/* Outer ring */}
      <circle cx={6} cy={6} r={5} stroke="currentColor" strokeWidth={1.5} />
      {/* Inner filled dot */}
      <circle cx={6} cy={6} r={2.5} fill="currentColor" />
    </svg>
  );
}
