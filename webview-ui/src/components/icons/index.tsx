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

/** Horizontal lines (list view toggle) — inherits text color via currentColor */
export function ListViewIcon({ className, size = 16 }: IconProps & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <line x1={1} y1={3} x2={11} y2={3} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={1} y1={6} x2={11} y2={6} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      <line x1={1} y1={9} x2={11} y2={9} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}

/** Tree hierarchy (tree view toggle) — inherits text color via currentColor */
export function TreeViewIcon({ className, size = 16 }: IconProps & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
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

/** Cloud shape for remote management — 12×12, inherits text color via currentColor */
export function CloudIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path
        d="M 3 9 C 1.5 9 0.5 8 0.5 6.5 C 0.5 5.2 1.3 4.2 2.5 4 C 2.8 2.5 4.2 1.5 6 1.5 C 7.8 1.5 9.2 2.5 9.5 4 C 10.7 4.2 11.5 5.2 11.5 6.5 C 11.5 8 10.5 9 9 9 Z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** X close icon — 12×12, inherits text color via currentColor */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 3 3 L 9 9 M 9 3 L 3 9" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

/** Right-pointing arrow for move panel — 12×12, inherits text color via currentColor */
export function MoveRightIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 2 6 H 10 M 7 3 L 10 6 L 7 9" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Down-pointing arrow for move panel — 12×12, inherits text color via currentColor */
export function MoveBottomIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path d="M 6 2 V 10 M 3 7 L 6 10 L 9 7" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Funnel/filter shape — 12×12, inherits text color via currentColor */
export function FilterIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path
        d="M 1.5 2.5 H 10.5 L 7 6.5 V 10 L 5 9 V 6.5 Z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Two-branch compare/diff shape — 12×12, inherits text color via currentColor */
export function CompareIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      {/* Left branch line */}
      <line x1={3} y1={2} x2={3} y2={10} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      {/* Right branch line */}
      <line x1={9} y1={2} x2={9} y2={10} stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
      {/* Connecting arrows */}
      <path d="M 3 3.5 H 7.5 M 6 2 L 7.5 3.5 L 6 5" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 9 8.5 H 4.5 M 6 7 L 4.5 8.5 L 6 10" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Gear/settings shape — 12×12, inherits text color via currentColor */
export function SettingsIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <circle cx={6} cy={6} r={1.8} stroke="currentColor" strokeWidth={1.2} />
      <path
        d="M 6 1 L 6.8 2.5 L 8.5 2 L 9 3.7 L 10.5 4.5 L 10 6 L 10.5 7.5 L 9 8.3 L 8.5 10 L 6.8 9.5 L 6 11 L 5.2 9.5 L 3.5 10 L 3 8.3 L 1.5 7.5 L 2 6 L 1.5 4.5 L 3 3.7 L 3.5 2 L 5.2 2.5 Z"
        stroke="currentColor"
        strokeWidth={1.1}
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Magnifier/search shape — 12×12, inherits text color via currentColor */
export function SearchIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <circle cx={5} cy={5} r={3.2} stroke="currentColor" strokeWidth={1.3} />
      <line x1={7.3} y1={7.3} x2={10.5} y2={10.5} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}

/** Circular refresh arrow — 12×12, inherits text color via currentColor */
export function RefreshIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path
        d="M 10.5 6 A 4.5 4.5 0 1 1 9.2 2.8"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 8 0.8 L 10.8 2.8 L 8 4.8"
        transform="rotate(25 10.5 2.8)"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Cloud with download arrow for fetch — 12×12, inherits text color via currentColor */
export function FetchIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <path
        d="M 3 8.5 C 1.8 8.5 1 7.7 1 6.5 C 1 5.4 1.7 4.6 2.7 4.4 C 3 3.1 4.2 2.2 5.8 2.2 C 7.4 2.2 8.6 3.1 8.9 4.4 C 9.9 4.6 10.6 5.4 10.6 6.5 C 10.6 7.7 9.8 8.5 8.6 8.5"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M 5.8 7.5 V 12 M 4 10.3 L 5.8 12 L 7.6 10.3" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Table/columns layout icon — 12×12, inherits text color via currentColor */
export function ColumnsIcon({ className }: IconProps) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" className={className} aria-hidden>
      <rect x={1} y={2} width={10} height={8} rx={1} stroke="currentColor" strokeWidth={1.2} />
      <line x1={4} y1={2} x2={4} y2={10} stroke="currentColor" strokeWidth={1.2} />
      <line x1={8} y1={2} x2={8} y2={10} stroke="currentColor" strokeWidth={1.2} />
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
