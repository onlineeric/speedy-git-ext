import type { ReactNode } from 'react';
import { AutosquashIllustration } from './AutosquashIllustration';
import { CommitNavigationIllustration } from './CommitNavigationIllustration';
import { MultiTabIllustration } from './MultiTabIllustration';
import { BranchIcon, CloudIcon, GoToHeadIcon, NewTabIcon } from './icons';
import { SubmoduleBadge } from './FileChangeShared';
import { InlineRefBadge } from './InlineRefBadge';
import { RefBadgeLegend } from './RefBadgeLegend';
import { dialogSectionLabelClassName } from './dialogStyles';
import {
  ContributorThanks,
  ExternalLink,
  FeatureCard,
  FeatureGrid,
  Step,
  StepFlow,
  ToolbarButtonSample,
  UiLabel,
  WhatsNewSection,
  whatsNewBodyTextClassName,
} from './whatsNewBlocks';
import {
  ADDED_COLOR,
  DELETED_COLOR,
  SHOWCASE_BLUE_COLOR,
  SHOWCASE_GREEN_COLOR,
  SHOWCASE_ORANGE_COLOR,
  SHOWCASE_PURPLE_COLOR,
  SHOWCASE_RED_COLOR,
} from '../utils/themeColors';

/**
 * The bordered panel older release notes group a topic into, and the body text
 * inside it. Newer entries compose the poster pieces in `whatsNewBlocks` instead.
 */
const calloutClassName = 'rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-textCodeBlock-background)] px-3 py-2';
const bodyTextClassName = whatsNewBodyTextClassName;

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
  /** One line under the title saying what the release is about; the hero's big type. */
  headline: string;
  /** Optional decorative visual shown beside the headline in the dialog's hero. */
  illustration?: ReactNode;
  content: ReactNode;
}

/**
 * Release notes shown on first run of a version. A version absent from this list
 * simply shows no dialog, so a release with nothing worth interrupting for needs
 * no other opt-out.
 */
export const WHATS_NEW_ENTRIES: readonly WhatsNewEntry[] = [
  {
    version: '5.18.0',
    headline: 'Jump to a commit’s parent or child straight from the details panel.',
    illustration: <CommitNavigationIllustration />,
    content: (
      <div className="space-y-6">
        <ContributorThanks login="nelson870708">
          This release comes from your request in{' '}
          <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/196">#196</ExternalLink>, to move
          between related commits without searching for a hash.
        </ContributorThanks>

        <WhatsNewSection title="Parents and children, one click away">
          <FeatureGrid>
            <FeatureCard mark="→" title="Go to it" accent={SHOWCASE_ORANGE_COLOR}>
              Click the <GoToHeadIcon className="inline h-3 w-3 align-[-1px]" /> icon beside a hash —{' '}
              <UiLabel>Go to parent commit</UiLabel> or <UiLabel>Go to child commit</UiLabel>. The graph scrolls
              to it and highlights it, like Go to HEAD, and the details panel follows.
            </FeatureCard>
            <FeatureCard mark="C" title="New Children row" accent={SHOWCASE_GREEN_COLOR}>
              A new <UiLabel>Children</UiLabel> row under <UiLabel>Parents</UiLabel> lists the commits built on
              this one that are in the current view.
            </FeatureCard>
            <FeatureCard mark="?" title="Which parent is which?" accent={SHOWCASE_PURPLE_COLOR}>
              Hover a hash to see its commit message — handy for the two parents of a merge.
            </FeatureCard>
            <FeatureCard mark="#" title="Click to copy" accent={SHOWCASE_BLUE_COLOR}>
              A parent or child hash copies the full hash on click, just like <UiLabel>Hash</UiLabel>.
            </FeatureCard>
          </FeatureGrid>
          <p className={`${bodyTextClassName} mt-3`}>
            A parent further back than the loaded commits is loaded for you. If a filter hides it, a message
            says so.
          </p>
        </WhatsNewSection>
      </div>
    ),
  },
  {
    version: '5.17.0',
    headline: 'Speedy Git is now multi-tab — open a graph per repository and arrange them like any other editor.',
    illustration: <MultiTabIllustration />,
    content: (
      <div className="space-y-6">
        <ContributorThanks login="jinho9265">
          This release comes from your request in{' '}
          <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/195">#195</ExternalLink>, for more
          than one graph in a window — a parent repository beside its submodule, and a graph of its own per
          repository in a multi-root workspace.
        </ContributorThanks>

        <WhatsNewSection title="Open another graph">
          <div className="flex items-start gap-3">
            <span className="shrink-0">
              <ToolbarButtonSample
                icon={<NewTabIcon className="h-6 w-6" />}
                label="New Tab"
                accent={SHOWCASE_PURPLE_COLOR}
              />
            </span>
            <p className={bodyTextClassName}>
              The new <UiLabel>Open New Graph Tab</UiLabel> button sits beside <em>Go to HEAD</em> in every
              graph’s toolbar. One click opens another graph straight away — no picker, no confirmation — on the
              same repository, in the same editor group.{' '}
              <UiLabel>Speedy Git: Open New Graph Tab</UiLabel> in the Command Palette does the same. Each tab is
              titled with the repository or submodule it is showing.
            </p>
          </div>
        </WhatsNewSection>

        <WhatsNewSection title="Arrange them the VS Code way">
          <FeatureGrid>
            <FeatureCard mark="S" title="Split left and right" accent={SHOWCASE_BLUE_COLOR}>
              Drag a graph into another editor group: one repository on the left, another on the right. VS Code’s
              own editor groups do the arranging, so Speedy Git adds no tab bar of its own.
            </FeatureCard>
            <FeatureCard mark="P" title="Parent and submodule" accent={SHOWCASE_PURPLE_COLOR}>
              Keep the parent repository open while a second graph follows its submodule. Moving the submodule’s
              pointer now refreshes both views.
            </FeatureCard>
            <FeatureCard mark="2" title="Two views, one repository" accent={SHOWCASE_GREEN_COLOR}>
              The same repository may be open in several tabs — one following a release branch while the other
              searches development history.
            </FeatureCard>
            <FeatureCard mark="I" title="Independent by design" accent={SHOWCASE_ORANGE_COLOR}>
              Repository and submodule selection, filters, search, selection, compare slots, columns and scroll
              belong to their tab. Changing one never disturbs another.
            </FeatureCard>
          </FeatureGrid>
        </WhatsNewSection>

        <WhatsNewSection title="A repository beside its submodule, in three moves">
          <StepFlow>
            <Step label="1" title="Open" accent={SHOWCASE_BLUE_COLOR}>
              Click <UiLabel>Open New Graph Tab</UiLabel> in the toolbar of the graph you are in.
            </Step>
            <Step label="2" title="Split" accent={SHOWCASE_PURPLE_COLOR}>
              Drag the new tab to the side, or use VS Code’s own split-editor command.
            </Step>
            <Step label="3" title="Point it somewhere" accent={SHOWCASE_GREEN_COLOR}>
              Switch the new graph to another repository or into a submodule. The graph you came from stays
              exactly as you left it.
            </Step>
          </StepFlow>
        </WhatsNewSection>

        <WhatsNewSection title="Every view keeps its bearings">
          <FeatureGrid>
            <FeatureCard mark="↩" title="Opening returns you there" accent={SHOWCASE_BLUE_COLOR}>
              <UiLabel>Show Speedy Git</UiLabel>, <code>Ctrl/Cmd+Shift+G</code> and the status bar item reveal the
              graph you were last in, and create one only when none is open. <UiLabel>Open in Speedy Git</UiLabel>{' '}
              in the Source Control view reveals a graph already showing that repository, or opens a new one.
              Neither ever retargets a graph you have open.
            </FeatureCard>
            <FeatureCard mark="!" title="Nothing acts on stale state" accent={SHOWCASE_RED_COLOR}>
              Views of one working tree say so while another is mid-operation — a notice only; no control is ever
              disabled by another view’s work. Reset, rebase, force-push, delete branch and drop commit now re-read
              their target first and refuse if it moved, and an open diff keeps the repository it came from.
            </FeatureCard>
          </FeatureGrid>
          <p className={`${bodyTextClassName} mt-3`}>
            Auto-refresh also reaches linked worktrees and submodules now, where <code>.git</code> is a file rather
            than a folder. Graph tabs themselves are session-only: reloading the window does not bring them back.
          </p>
        </WhatsNewSection>

        <WhatsNewSection title="Toolbar buttons fit narrow views">
          <p className={bodyTextClassName}>
            When space is tight, the right-hand buttons move into a <UiLabel>…</UiLabel> dropdown first,
            followed by the left-hand buttons. Widen the view and they return. Your label and button visibility
            settings still apply, and each button keeps its right-click menu.
          </p>
        </WhatsNewSection>
      </div>
    ),
  },
  {
    version: '5.16.0',
    headline: 'Create fixup and squash commits from the graph, then autosquash them when you rebase.',
    illustration: <AutosquashIllustration />,
    content: (
      <div className="space-y-6">
        <ContributorThanks login="nelson870708">
          This release comes from your request in{' '}
          <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/194">#194</ExternalLink>, asking
          for fixup and squash commits without dropping to the command line.
        </ContributorThanks>

        <WhatsNewSection title="Four kinds, one right-click">
          <p className={`${bodyTextClassName} mb-3`}>
            Right-click any commit and pick <UiLabel>Create Fixup Commit…</UiLabel>. It creates a new commit on
            HEAD that targets the one you clicked, in any of git&apos;s four kinds:
          </p>
          <FeatureGrid>
            <FeatureCard mark="F" title="Fixup" gitFlag="--fixup" accent={SHOWCASE_BLUE_COLOR}>
              Add your changes; the target keeps its message.
            </FeatureCard>
            <FeatureCard mark="S" title="Squash" gitFlag="--squash" accent={SHOWCASE_PURPLE_COLOR}>
              Add your changes and combine the messages, with an optional note of your own.
            </FeatureCard>
            <FeatureCard mark="A" title="Amend" gitFlag="--fixup=amend:" accent={SHOWCASE_ORANGE_COLOR}>
              Add your changes and give the target a new message.
            </FeatureCard>
            <FeatureCard mark="R" title="Reword" gitFlag="--fixup=reword:" accent={SHOWCASE_GREEN_COLOR}>
              Just give the target a new message.
            </FeatureCard>
          </FeatureGrid>
          <p className={`${bodyTextClassName} mt-3`}>
            Choose staged changes only or all tracked changes (<code>-a</code>), and the command preview shows
            exactly what runs.
          </p>
        </WhatsNewSection>

        <WhatsNewSection title="Apply them with autosquash">
          <StepFlow>
            <Step label="1" title="Create" accent={SHOWCASE_BLUE_COLOR}>
              <UiLabel>Create Fixup Commit…</UiLabel> on each commit you want to change.
            </Step>
            <Step label="2A" title="Rebase" accent={SHOWCASE_PURPLE_COLOR}>
              <UiLabel>Rebase Current Branch onto This Commit</UiLabel> has a new <em>Autosquash</em> checkbox
              that folds them into their targets and tells you how many will be applied.
            </Step>
            <Step label="2B" title="Interactive rebase" accent={SHOWCASE_GREEN_COLOR} alternative>
              <UiLabel>Interactive Rebase onto This Commit</UiLabel> moves each one under its target before you start — you can
              still adjust the plan or uncheck it.
            </Step>
          </StepFlow>
        </WhatsNewSection>
      </div>
    ),
  },
  {
    version: '5.15.0',
    headline: 'Double-click a branch badge to switch branches.',
    content: (
      <>
        <section className={calloutClassName}>
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className={bodyTextClassName}>
            Thanks to <ExternalLink url="https://github.com/brainz80">@brainz80</ExternalLink> for requesting
            faster branch switching in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/193">#193</ExternalLink>!
          </p>
        </section>
        <ul className={`${bodyTextClassName} mt-4 space-y-3`}>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Local branches:</strong>{' '}
            double-click a branch badge to switch without pulling. This also works on combined
            local/cloud badges and branch badges inside the +N popover.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Remote branches:</strong>{' '}
            if a local branch of that name already exists, choose Pull or No pull in the familiar
            Checkout dialog. Pull is selected by default and uses the local branch&apos;s configured
            upstream. If there is no local counterpart, a tracking branch is created from the remote you clicked.
          </li>
          <li>
            If changes block checkout, you can choose to stash tracked changes first. A branch already
            checked out in another worktree offers to open that worktree. Right-click menus remain available.
          </li>
        </ul>
      </>
    ),
  },
  {
    version: '5.14.0',
    headline: 'Search now reaches branches, tags and authors — and understands more than one word at a time.',
    content: (
      <>
        <section className={calloutClassName}>
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className={bodyTextClassName}>
            This release comes from a request by{' '}
            <ExternalLink url="https://github.com/nelson870708">@nelson870708</ExternalLink> in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/191">#191</ExternalLink>
            , asking that search look beyond commit messages — you usually remember who wrote a commit,
            or which branch or tag it belongs to. Thank you!
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
          Search already covered the message, the author name and the commit hash. It now also matches:
        </p>

        <ul className={`${bodyTextClassName} mt-3 space-y-2`}>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Branch and tag names.</strong> As
            substrings, like the message — <code>feature</code> finds <code>feature/new-ui</code>,{' '}
            <code>v1.2</code> finds <code>v1.2.0</code>. A remote branch answers to both{' '}
            <code>main</code> and <code>origin/main</code>.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Author email.</strong> What you
            actually type when the display name is “John Smith” but you remember{' '}
            <code>john.smith</code>.
          </li>
        </ul>

        <section className={`${calloutClassName} mt-4`}>
          <h3 className={dialogSectionLabelClassName}>Several words now work the way you expect</h3>
          <p className={bodyTextClassName}>
            <code>john fix</code> used to search for that exact text and find nothing. It is now two
            terms, and a commit matches when <em>both</em> match it somewhere — so this finds a commit
            by John about a fix. Wrap words in <code>&quot;quotes&quot;</code> to search for the phrase
            itself. That is the whole syntax: no regex, no toggles.
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
          With this many fields able to match, the row highlight alone no longer says <em>why</em> a row
          matched — so the matching text is now boxed where it lands, inside the message, the author, the
          hash and the ref badge. Your place in the results also survives loading another batch or
          typing another character, instead of jumping back to the first match.
        </p>
      </>
    ),
  },
  {
    version: '5.13.0',
    headline: 'A worktree folder can now keep your branch name’s slashes, instead of always flattening them.',
    content: (
      <>
        <section className={calloutClassName}>
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className={bodyTextClassName}>
            This release comes from a request by{' '}
            <ExternalLink url="https://github.com/nelson870708">@nelson870708</ExternalLink> in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/189">#189</ExternalLink>
            , asking that a branch’s directory structure be preserved when creating a worktree.
            Thank you!
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
          Creating a worktree from <code>feat/branch1</code> used to suggest one folder,{' '}
          <code>feat-branch1</code>, with the <code>/</code> flattened away. The Create Worktree dialog
          now offers both shapes, each showing its own complete path:
        </p>

        <ul className={`${bodyTextClassName} mt-3 space-y-2`}>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Nested path</strong> —{' '}
            <code>&lt;base&gt;/feat/branch1</code>, mirroring how you already organise your branches.
          </li>
          <li>
            <strong className="text-[var(--vscode-foreground)]">Flatten path</strong> —{' '}
            <code>&lt;base&gt;/feat-branch1</code>, what previous versions always did.
          </li>
        </ul>

        <p className={`${bodyTextClassName} mt-3`}>
          The selected row’s box is editable exactly as the single box was; the other stays readable so
          you can compare the two before choosing. A small link below them saves your pick as the
          default. Branch names without a <code>/</code> are unchanged — one label, one box, as before.
        </p>

        <section className={`${calloutClassName} mt-4`}>
          <h3 className={dialogSectionLabelClassName}>Nesting does not leave empty folders behind</h3>
          <p className={bodyTextClassName}>
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
        <p className={bodyTextClassName}>
          Right-click the commit you have checked out and pick{' '}
          <em>Amend Last Commit…</em>. The dialog opens with that commit’s existing message already in
          it — the whole message, body and trailers included, not just the first line.
        </p>

        <ul className={`${bodyTextClassName} mt-3 space-y-2`}>
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

        <section className={`${calloutClassName} mt-4`}>
          <h3 className={dialogSectionLabelClassName}>Amending a commit you have pushed</h3>
          <p className={bodyTextClassName}>
            Amending replaces the commit rather than adding to it, so a commit that is already on a
            remote will need a force push before the two agree again. The dialog says so before you
            confirm, and names the branch that will move — worth reading if more than one branch sits
            on the commit, because only the checked-out one follows the rewrite.
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
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
        <p className={bodyTextClassName}>
          Merging used to be offered only when you right-clicked a local branch badge. It is now on
          three more places, each running the merge you would type yourself:
        </p>

        <ul className={`${bodyTextClassName} mt-3 space-y-2`}>
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

        <section className={`${calloutClassName} mt-4`}>
          <h3 className={dialogSectionLabelClassName}>If a merge hits a conflict</h3>
          <p className={bodyTextClassName}>
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
        <section className={calloutClassName}>
          <h3 className={dialogSectionLabelClassName}>Thanks to our contributor</h3>
          <p className={bodyTextClassName}>
            This release comes from a report by{' '}
            <ExternalLink url="https://github.com/jinho9265">@jinho9265</ExternalLink> in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/issues/184">#184</ExternalLink>
            , who not only found that submodule diffs opened empty but worked out exactly why and
            what the fix should look like. Their first issue — thank you!
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
          Opening a commit that moves a submodule to a new commit used to show a diff that was blank
          on both sides. A submodule is not a file: this repository stores only a pointer to a commit
          that lives in the submodule’s own repository, so there was never any content here to show.
          Both sides now show that pointer, just as <code>git diff</code> does — so the diff tells you
          which commit the submodule moved from and to.
        </p>

        <pre className={`${calloutClassName} mt-3 overflow-x-auto text-xs leading-relaxed`}>
          <span style={DELETED_LINE_STYLE}>- Subproject commit f4b7306bdab79fb7fc3fad64c2cf98667147d892</span>
          {'\n'}
          <span style={ADDED_LINE_STYLE}>+ Subproject commit ec5f862988547fabd5c10efa49c288469314e41a</span>
        </pre>

        <p className={`${bodyTextClassName} mt-4`}>
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
        <section className={calloutClassName}>
          <p className={bodyTextClassName}>
            This release started with a contribution from{' '}
            <ExternalLink url="https://github.com/jayll1303">@jayll1303</ExternalLink>, who noticed
            that spelling out <code>main ⇄ origin/main</code> ate a lot of row width on a small
            screen and proposed the cloud icon in{' '}
            <ExternalLink url="https://github.com/onlineeric/speedy-git-ext/pull/181">#181</ExternalLink>
            . Their first contribution — thank you!
          </p>
        </section>

        <p className={`${bodyTextClassName} mt-4`}>
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
