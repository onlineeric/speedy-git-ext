import { useState, type CSSProperties, type ReactNode } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import {
  BORDER_COLOR,
  FOREGROUND_COLOR,
  ON_ACCENT_COLOR,
  SHOWCASE_RED_COLOR,
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

/** A grid of feature cards that collapses to one column in a narrow panel. */
export function FeatureGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{children}</div>;
}

interface FeatureCardProps {
  /** One or two characters shown in the colored tile. */
  mark: string;
  title: string;
  /** A `SHOWCASE_*` color; the card's border, wash and tile all derive from it. */
  accent: string;
  children: ReactNode;
}

export function FeatureCard({ mark, title, accent, children }: FeatureCardProps) {
  const style: CSSProperties = {
    borderColor: tint(accent, 35),
    background: `linear-gradient(150deg, ${tint(accent, 16)}, transparent 75%)`,
  };

  return (
    <div className="rounded-lg border p-3 transition-transform duration-150 hover:-translate-y-0.5" style={style}>
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-xs font-bold"
          style={{ background: accent, color: ON_ACCENT_COLOR }}
        >
          {mark}
        </span>
        <span className="text-sm font-semibold" style={{ color: FOREGROUND_COLOR }}>
          {title}
        </span>
      </div>
      <p className={`${whatsNewBodyTextClassName} mt-1.5`}>{children}</p>
    </div>
  );
}

/** A menu item or control name, set as a chip so it can be spotted in the real UI. */
export function UiLabel({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-1.5 py-px font-medium text-[var(--vscode-foreground)]">
      {children}
    </span>
  );
}

/** Numbered steps side by side; stacks in a narrow panel. */
export function StepFlow({ children }: { children: ReactNode }) {
  return <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</ol>;
}

interface StepProps {
  number: number;
  title: string;
  accent: string;
  children: ReactNode;
}

export function Step({ number, title, accent, children }: StepProps) {
  return (
    <li className="relative rounded-lg border border-[var(--vscode-panel-border)] p-3">
      <div className="flex items-center gap-2">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: tint(accent, 25), color: accent, boxShadow: `0 0 0 1px ${tint(accent, 55)}` }}
        >
          {number}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: FOREGROUND_COLOR }}>
          {title}
        </span>
      </div>
      <p className={`${whatsNewBodyTextClassName} mt-2`}>{children}</p>
    </li>
  );
}
