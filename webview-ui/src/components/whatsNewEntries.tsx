import type { ReactNode } from 'react';
import { rpcClient } from '../rpc/rpcClient';
import { trackUiInteraction } from '../utils/telemetry';
import { BranchIcon, CloudIcon } from './icons';
import { SubmoduleBadge } from './FileChangeShared';
import { InlineRefBadge } from './InlineRefBadge';
import { RefBadgeLegend } from './RefBadgeLegend';
import { dialogSectionLabelClassName } from './dialogStyles';
import { ADDED_COLOR, DELETED_COLOR } from '../utils/themeColors';

const ADDED_LINE_STYLE = { color: ADDED_COLOR };
const DELETED_LINE_STYLE = { color: DELETED_COLOR };

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
    version: '5.11.0',
    headline: 'You can now merge from a commit, a remote branch or a tag — not just a local branch.',
    content: (
      <>
        <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Merging used to be offered only when you right-clicked a local branch badge. It is now on
          three more places, each running the merge you would type yourself:
        </p>

        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          <li>
            <strong className="text-[var(--vscode-foreground)]">Any commit row.</strong> Right-click a
            commit and pick <em>Merge into Current Branch</em>. Useful when the point you want is not
            the tip of a branch — or when that branch’s badge is not on screen.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">A remote branch badge.</strong> Merges{' '}
            <code>origin/main</code> itself, not a local branch that happens to share the name.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">A tag badge.</strong> Merge a release
            tag straight into the branch you are on.
          </li>
        </ul>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          All four use the same dialog, with the same <code>--squash</code>, <code>--no-commit</code>{' '}
          and <code>--no-ff</code> options, and show the exact command before you run it.
        </p>

        <section className="mt-4 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <h3 className={dialogSectionLabelClassName}>If a merge hits a conflict</h3>
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            <em>Continue Merge</em> and <em>Abort Merge</em> now appear in the right-click menus for as
            long as the merge is paused, so you can finish it or back out without leaving the graph.
            They are still there if you close the window and come back.
          </p>
        </section>
      </>
    ),
  },
  {
    version: '5.10.1',
    headline: 'Submodule changes now show which commit the submodule moved to.',
    content: (
      <>
        <section className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            This release comes from a report by{' '}
            <ExternalLink url="https://github.com/jinho9265">@jinho9265</ExternalLink> in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/184">#184</ExternalLink>
            , who not only found that submodule diffs opened empty but worked out exactly why and
            what the fix should look like. Their first issue — thank you!
          </p>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Opening a commit that moves a submodule to a new commit used to show a diff that was blank
          on both sides. A submodule is not a file: this repository stores only a pointer to a commit
          that lives in the submodule’s own repository, so there was never any content here to show.
          Both sides now show that pointer, just as <code>git diff</code> does — so the diff tells you
          which commit the submodule moved from and to.
        </p>

        <pre className="mt-3 overflow-x-auto rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2 text-xs leading-relaxed">
          <span style={DELETED_LINE_STYLE}>- Subproject commit f4b7306bdab79fb7fc3fad64c2cf98667147d892</span>
          {'\n'}
          <span style={ADDED_LINE_STYLE}>+ Subproject commit ec5f862988547fabd5c10efa49c288469314e41a</span>
        </pre>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Submodule rows are marked with a <SubmoduleBadge /> badge, since a two-line diff is
          otherwise hard to tell from a broken one. Uncommitted submodule changes, which previously
          could not be opened at all, now work the same way.
        </p>
      </>
    ),
  },
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
