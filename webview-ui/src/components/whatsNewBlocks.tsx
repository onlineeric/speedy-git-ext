import { useState, type CSSProperties, type ReactNode } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  ON_ACCENT_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SHOWCASE_RED_COLOR,
  SURFACE_COLOR,
  tint,
} from '../utils/themeColors';
import { HeartIcon } from './icons';

/**
 * Building blocks for What's New entries. The dialog advertises a release, so
 * these are poster pieces — cards, a step flow, a thank-you ribbon — rather than
 * paragraphs. Entries compose them; a release reads as one designed page only
 * while every entry uses the same pieces.
 */

export const whatsNewBodyTextClassName = 'text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]';

/** A link out of the dialog; the webview cannot navigate itself. */
export function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="font-medium underline decoration-dotted underline-offset-2 text-[var(--vscode-textLink-foreground)] hover:text-[var(--vscode-textLink-activeForeground)]"
      onClick={() => {
        trackUiInteraction('whatsNewDialog', 'whatsNewOpenContribution');
        rpcClient.openExternal(url);
      }}
    >
      {children}
    </button>
  );
}

/** A section with a small caption followed by a hairline that fades out. */
export function WhatsNewSection({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--vscode-descriptionForeground)]">
          {title}
        </h3>
        <span aria-hidden className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${BORDER_COLOR}, transparent)` }} />
      </div>
      {children}
    </section>
  );
}

interface ContributorThanksProps {
  /** GitHub login, without the `@`. */
  login: string;
  children: ReactNode;
}

/**
 * The thank-you ribbon. Shows the contributor's GitHub avatar — the host the CSP
 * already allows for commit avatars — and falls back to a heart when it cannot
 * load (offline, renamed account).
 */
export function ContributorThanks({ login, children }: ContributorThanksProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: tint(SHOWCASE_RED_COLOR, 35), background: tint(SHOWCASE_RED_COLOR, 8) }}
    >
      <span className="relative shrink-0">
        {avatarFailed ? (
          <span
            className="grid h-9 w-9 place-items-center rounded-full"
            style={{ background: tint(SHOWCASE_RED_COLOR, 22), color: SHOWCASE_RED_COLOR }}
          >
            <HeartIcon className="h-4 w-4" />
          </span>
        ) : (
          <img
            src={`https://avatars.githubusercontent.com/${encodeURIComponent(login)}?s=72`}
            alt=""
            className="h-9 w-9 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${tint(SHOWCASE_RED_COLOR, 45)}` }}
            onError={() => setAvatarFailed(true)}
          />
        )}
        {!avatarFailed && (
          <span
            className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full"
            style={{ background: SHOWCASE_RED_COLOR, color: ON_ACCENT_COLOR }}
          >
            <HeartIcon className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <p className={whatsNewBodyTextClassName}>
        <span className="font-semibold" style={{ color: FOREGROUND_COLOR }}>
          Thanks, <ExternalLink url={`https://github.com/${login}`}>@{login}</ExternalLink>!
        </span>{' '}
        {children}
      </p>
    </div>
  );
}

interface ToolbarButtonSampleProps {
  /** The real icon component, at the size the toolbar renders it. */
  icon: ReactNode;
  /** The label under it, spelled as the toolbar spells it. */
  label: string;
  /** A `SHOWCASE_*` color for the sample's outline and wash. */
  accent: string;
}

/**
 * A toolbar button drawn the way the graph's toolbar draws it — icon above its
 * small label — so a reader can find a new button by sight rather than by
 * hunting for its name. Uses the real icon component, so the picture cannot
 * drift from the button.
 */
export function ToolbarButtonSample({ icon, label, accent }: ToolbarButtonSampleProps) {
  return (
    <span
      className="inline-flex flex-col items-center justify-center rounded-md px-2 pb-1 pt-1.5 align-middle"
      style={{ boxShadow: `inset 0 0 0 1px ${tint(accent, 55)}`, background: tint(accent, 14), color: FOREGROUND_COLOR }}
    >
      {icon}
      <span className="select-none text-[11px] font-semibold leading-[13px] tracking-tight">{label}</span>
    </span>
  );
}

/** A grid of feature cards that collapses to one column in a narrow panel. */
export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>;
}

interface FeatureCardProps {
  /** One or two characters shown in the colored tile. */
  mark: string;
  title: string;
  /** The git flag this card corresponds to, shown beside the title. */
  gitFlag?: string;
  /** A `SHOWCASE_*` color; the card's border, wash and tile all derive from it. */
  accent: string;
  children: ReactNode;
}

export function FeatureCard({ mark, title, gitFlag, accent, children }: FeatureCardProps) {
  const style: CSSProperties = {
    borderColor: tint(accent, 35),
    background: `linear-gradient(150deg, ${tint(accent, 16)}, transparent 75%)`,
  };

  return (
    <div className="rounded-lg border p-3 transition-transform duration-150 hover:-translate-y-0.5" style={style}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-xs font-bold"
          style={{ background: accent, color: ON_ACCENT_COLOR }}
        >
          {mark}
        </span>
        <span className="text-sm font-semibold" style={{ color: FOREGROUND_COLOR }}>
          {title}
        </span>
        {gitFlag && (
          <code className="rounded px-1 py-px text-[11px]" style={{ color: accent, background: tint(accent, 14) }}>
            {gitFlag}
          </code>
        )}
      </div>
      <p className={`${whatsNewBodyTextClassName} mt-1.5`}>{children}</p>
    </div>
  );
}

const uiLabelStyle: CSSProperties = {
  color: FOREGROUND_COLOR,
  background: tint(SHOWCASE_ORANGE_COLOR, 28),
  boxShadow: `inset 0 0 0 1px ${tint(SHOWCASE_ORANGE_COLOR, 70)}`,
};

/**
 * A menu item or control name, highlighted like a marker pen so the reader goes
 * looking for exactly that text in the real UI. It wraps like the words around
 * it, with `box-decoration-clone` giving every line its own rounded box, so a
 * long label never overflows a narrow card.
 */
export function UiLabel({ children }: { children: ReactNode }) {
  return (
    <span className="box-decoration-clone rounded px-1.5 py-px font-semibold" style={uiLabelStyle}>
      {children}
    </span>
  );
}

/**
 * Steps side by side; stacks in a narrow panel. Label alternatives `2A`/`2B` and
 * mark the second with `alternative` so the two read as a choice, not a sequence.
 */
export function StepFlow({ children }: { children: ReactNode }) {
  return <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</ol>;
}

interface StepProps {
  /** `1`, `2A`, `2B`… */
  label: string;
  title: string;
  accent: string;
  /** An alternative to the step before it: draws an "or" joining the two. */
  alternative?: boolean;
  children: ReactNode;
}

export function Step({ label, title, accent, alternative = false, children }: StepProps) {
  return (
    <li className="relative rounded-lg border border-[var(--vscode-panel-border)] p-3">
      {alternative && (
        // Sits on the shared edge with the previous card: its top when stacked,
        // its left side when the steps run in a row.
        <span
          className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border px-1.5 text-[10px] font-bold uppercase leading-4 sm:left-0 sm:top-1/2"
          style={{ borderColor: BORDER_COLOR, background: SURFACE_COLOR, color: FOREGROUND_COLOR }}
        >
          or
        </span>
      )}
      <div className="flex items-center gap-2">
        <span
          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1 text-[11px] font-bold"
          style={{ background: tint(accent, 25), color: accent, boxShadow: `0 0 0 1px ${tint(accent, 55)}` }}
        >
          {label}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: FOREGROUND_COLOR }}>
          {title}
        </span>
      </div>
      <p className={`${whatsNewBodyTextClassName} mt-2`}>{children}</p>
    </li>
  );
}
