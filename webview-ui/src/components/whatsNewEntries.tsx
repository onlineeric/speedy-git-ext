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
    version: '5.13.0',
    headline: 'A worktree folder can now keep your branch name’s slashes, instead of always flattening them.',
    content: (
      <>
        <section className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            This release comes from a request by{' '}
            <ExternalLink url="https://github.com/nelson870708">@nelson870708</ExternalLink> in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/189">#189</ExternalLink>
            , asking that a branch’s directory structure be preserved when creating a worktree.
            Thank you!
          </p>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Creating a worktree from <code>feat/branch1</code> used to suggest one folder,{' '}
          <code>feat-branch1</code>, with the <code>/</code> flattened away. The Create Worktree dialog
          now offers both shapes, each showing its own complete path:
        </p>

        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          <li>
            <strong className="text-[var(--vscode-foreground)]">Nested path</strong> —{' '}
            <code>&lt;base&gt;/feat/branch1</code>, mirroring how you already organise your branches.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Flatten path</strong> —{' '}
            <code>&lt;base&gt;/feat-branch1</code>, what previous versions always did.
          </li>
        </ul>

        <p className="mt-3 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          The selected row’s box is editable exactly as the single box was; the other stays readable so
          you can compare the two before choosing. A small link below them saves your pick as the
          default. Branch names without a <code>/</code> are unchanged — one label, one box, as before.
        </p>

        <section className="mt-4 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <h3 className={dialogSectionLabelClassName}>Nesting does not leave empty folders behind</h3>
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            Removing a worktree now also deletes the folders that removal just emptied, stopping before
            your configured base path, which is never touched. Pruning sweeps the base path the same
            way. Worktrees you placed somewhere custom are left entirely alone.
          </p>
        </section>
      </>
    ),
  },
  {
    version: '5.12.0',
    headline: 'You can now amend the last commit without leaving the graph.',
    content: (
      <>
        <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Right-click the commit you have checked out and pick{' '}
          <em>Amend Last Commit…</em>. The dialog opens with that commit’s existing message already in
          it — the whole message, body and trailers included, not just the first line.
        </p>

        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          <li>
            <strong className="text-[var(--vscode-foreground)]">Fix the message.</strong> The most
            common reason to amend, and on its own it changes nothing else.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Fold in staged files — only if you
            ask.</strong> A checkbox tells you how many files are staged, and it is{' '}
            <em>off</em> by default. Plain <code>git commit --amend</code> swallows whatever is in the
            index; here, files you staged for the <em>next</em> commit stay staged for it.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Force push afterwards.</strong> When
            the commit is already on a remote and your branch tracks one, a checkbox offers the push
            as a second step. The command preview spells out what it runs —{' '}
            <code>--force-with-lease</code>.
          </li>
        </ul>

        <section className="mt-4 rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2">
          <h3 className={dialogSectionLabelClassName}>Amending a commit you have pushed</h3>
          <p className="text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
            Amending replaces the commit rather than adding to it, so a commit that is already on a
            remote will need a force push before the two agree again. The dialog says so before you
            confirm, and names the branch that will move — worth reading if more than one branch sits
            on the commit, because only the checked-out one follows the rewrite.
          </p>
        </section>

        <p className="mt-4 text-xs leading-relaxed text-[var(--vscode-descriptionForeground)]">
          Amending runs your <code>pre-commit</code> and <code>commit-msg</code> hooks, even when only
          the message changed. If they take a while the dialog says it is waiting on them and lets you
          stop waiting, rather than looking frozen.
        </p>
      </>
    ),
  },
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
