import type { ReactNode } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { BranchIcon, CloudIcon } from './icons';
import { InlineRefBadge } from './InlineRefBadge';
import { RefBadgeLegend } from './RefBadgeLegend';

/**
 * One release's "What's new" content.
 *
 * Content is a `ReactNode` rather than markup-in-a-string so a release can show
 * live UI — the 5.10.0 entry embeds the real `RefBadgeLegend`, which means the
 * release notes demonstrate the actual badges instead of describing them.
 */
export interface WhatsNewEntry {
  /** Exact `package.json` version this content belongs to. */
  version: string;
  /** One line under the title saying what the release is about. */
  headline: string;
  content: ReactNode;
}

/** A link out of the dialog; the webview cannot navigate itself. */
function ExternalLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="underline text-[var(--vscode-textLink-foreground)] hover:text-[var(--vscode-textLink-activeForeground)]"
      onClick={() => {
        trackUiInteraction('whatsNewDialog', 'whatsNewOpenContribution');
        rpcClient.openExternal(url);
      }}
    >
      {children}
    </button>
  );
}

/**
 * Release notes shown on first run of a version. A version absent from this list
 * simply shows no dialog, so a release with nothing worth interrupting for needs
 * no other opt-out.
 */
export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  {
    version: '5.10.0',
    headline: 'Branch badges now say where a branch lives with icons instead of words.',
    content: (
      <>
        <section className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            This release started with a contribution from{' '}
            <ExternalLink url="https://github.com/jayll1303">@jayll1303</ExternalLink>, who noticed
            that spelling out <code>main ⇄ origin/main</code> ate a lot of row width on a small
            screen and proposed the cloud icon in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/pull/181">#181</ExternalLink>
            . Their first contribution — thank you!
          </p>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          The fork glyph <InlineRefBadge><BranchIcon /></InlineRefBadge> now means “exists locally”
          and the cloud <InlineRefBadge><CloudIcon /></InlineRefBadge> means “exists on a remote”, so
          a branch that is both reads as the two combined. Remote names moved into the badge’s
          tooltip, and a branch pushed to several remotes shows how many.
        </p>

        <RefBadgeLegend className="mt-4" />
      </>
    ),
  },
];

/** The content for a version, or `undefined` when that release has nothing to announce. */
export function findWhatsNewEntry(version: string): WhatsNewEntry | undefined {
  return WHATS_NEW_ENTRIES.find((entry) => entry.version === version);
}
