import { useFirstLaneBadgeStyle } from '../stores/graphSelectors';
import {
  LEGEND_INLINE_ICON_PLACEHOLDER,
  REF_BADGE_LEGEND,
  type LegendInlineIcon,
  type RefBadgeLegendEntry,
  type RefBadgeLegendSample,
} from '../utils/refBadgeLegend';
import { dialogSectionLabelClassName } from './dialogStyles';
import { GoToHeadIcon, HeadIcon, INLINE_ICON_CLASS } from './icons';
import { RefLabel } from './RefLabel';

interface RefBadgeLegendProps {
  /** Set false when the host already titles the section (e.g. a What's New dialog). */
  showHeading?: boolean;
  className?: string;
}

/**
 * Explains the graph's badge vocabulary: what each icon means and how the branch
 * icons combine.
 *
 * Requires no props and no dialog context, so it can be dropped into the Help
 * dialog, a "What's new" dialog, or anywhere else as `<RefBadgeLegend />`. The
 * samples are rendered by the real `RefLabel`, in the graph's own first lane
 * color, which is what keeps the legend honest — it explains the badges the
 * graph actually draws rather than a picture of them.
 */
export function RefBadgeLegend({ showHeading = true, className }: RefBadgeLegendProps) {
  // Lane 0 — the color of the graph's first column, so a sample badge here is
  // one the user has already seen on screen.
  const { laneColor, laneColorStyle } = useFirstLaneBadgeStyle();

  return (
    <section className={className}>
      {showHeading && <h3 className={dialogSectionLabelClassName}>Badge Legend</h3>}
      <dl className="flex flex-col gap-1.5">
        {REF_BADGE_LEGEND.map((entry) => (
          <div key={entry.id} className="flex items-start gap-3">
            {/* Fixed column so every description starts at the same place, however wide its badge. */}
            <dt className="flex w-40 shrink-0 justify-end pt-px">
              <LegendSample sample={entry.sample} laneColor={laneColor} laneColorStyle={laneColorStyle} />
            </dt>
            <dd className="flex-1 text-xs leading-snug text-[var(--vscode-descriptionForeground)]">
              <LegendDescription entry={entry} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Renders a description, substituting the toolbar glyph where the entry asks for one. */
function LegendDescription({ entry }: { entry: RefBadgeLegendEntry }) {
  if (!entry.inlineIcon) return <>{entry.description}</>;

  const [before, after] = entry.description.split(LEGEND_INLINE_ICON_PLACEHOLDER);
  return (
    <>
      {before}
      <InlineIcon name={entry.inlineIcon} />
      {after}
    </>
  );
}

function InlineIcon({ name }: { name: LegendInlineIcon }) {
  switch (name) {
    case 'goToHead':
      // Sized to the surrounding text rather than to the toolbar, so the line stays even.
      return <GoToHeadIcon className={INLINE_ICON_CLASS} />;
  }
}

function LegendSample({
  sample,
  laneColor,
  laneColorStyle,
}: {
  sample: RefBadgeLegendSample;
  laneColor: string;
  laneColorStyle: React.CSSProperties;
}) {
  // The HEAD marker takes the bare lane color, matching how `CommitTableRow` draws it.
  if (sample.kind === 'head') {
    return <HeadIcon style={{ color: laneColor }} />;
  }
  return (
    <RefLabel
      displayRef={sample.displayRef}
      worktree={sample.worktree}
      laneColorStyle={laneColorStyle}
      className="whitespace-nowrap"
    />
  );
}
