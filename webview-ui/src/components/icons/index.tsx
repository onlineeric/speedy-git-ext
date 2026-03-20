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
