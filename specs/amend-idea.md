# Idea Spec: Amend Last Commit

Date: 2026-08-24
Status: Idea — all questions resolved. Reviewed 2026-08-25 against the implementation spec; the
revisions from that pass are marked *(review 2026-08-25)*.
Scope note: this document is intentionally free of technical detail. Services, message types, file
layout and tests belong in the implementation spec that follows it.

## Context

Speedy Git can stage, unstage and discard, but it cannot create or modify a commit — final commit
creation is delegated to VS Code's SCM view. Amending the last commit is the highest-frequency half
of that gap: fixing a typo in the message you just wrote, or folding one forgotten file into the
commit you just made.

Amend is also the *safe* half. Rewriting the tip commit is a direct, single-step operation with no
todo list, no replay of later commits, and therefore no possibility of conflicts. Rewording an
*older* commit is a different animal — it replays everything above it and can conflict — and is
already served by the existing interactive-rebase reword path. This idea covers only the tip.

Related: `specs/roadmap_1.md` ranks "commit creation, amend, commit-and-push" as the #1 missing
feature. This is a deliberate first slice of that rank, not the whole of it.

## Scope

In scope:

- Amending the commit that HEAD points at: its message, and optionally the currently staged changes.
- One dialog, reached from the commit row menu on the HEAD row.
- Optionally force-pushing the branch afterwards.
- The prerequisite reword fix described below, built first and released alongside.

Out of scope for this idea:

- Creating a new commit (a commit panel/box for staged changes).
- Rewording a commit that is not HEAD.
- Changing the author, resetting the author, skipping hooks, sign-off, co-authors, commit templates.
- Choosing *which* files are in the commit from inside the dialog — that is staging, and staging
  already exists on the uncommitted-changes node.

## Decisions

| Question | Decision |
| --- | --- |
| Entry point | The HEAD commit row menu, plus the badge of the branch that is checked out *(revised 2026-08-25)*. Not the uncommitted node, not the details panel. |
| Dialog shape | One "Amend Last Commit…" dialog: message field + "include staged changes" checkbox. |
| Staged changes default | **Off.** The dialog shows the staged count but never absorbs staged work unless asked. |
| Force push | A checkbox **inside** the dialog, default off, labelled "Force Push after amended". |
| Reword body-loss fix | **Built first** — it introduces the full-message read amend depends on — but **released together** with amend in 5.12.0. |
| Another operation in progress | **Blocked** during rebase, merge, revert and cherry-pick — all four. |
| Force-push flavour | **`--force-with-lease`**, always. The real flag is visible in the command preview. |
| Push checkbox when nothing is published | **Hidden.** It appears only when the commit being amended exists on a remote **and the checked-out branch itself has a remote counterpart** *(revised 2026-08-25)*. |
| Slow hooks | **60-second ceiling** (up from the usual 30) plus a "waiting on hooks" state **with a Cancel button**. |
| What cancel/timeout reports | **What actually happened**, read from HEAD after the fact — never an assumption *(review 2026-08-25)*. |
| Dialog on any failure | **Stays open with the typed message intact**, not just on the HEAD-moved refusal *(review 2026-08-25)*. |
| Undo / reflog hint | **Quiet success.** No recovery hint; the graph refreshes and that is all. |
| Authorship / signature notes | **Signature note only**, shown when the commit is signed. No authorship note. |
| HEAD moved while the dialog was open | **Refuse and keep the dialog open**, preserving what the user typed. |
| How the blocked state looks | **Silently disabled**, matching every other item; the backend guard stays as a second line of defence. |
| Release | Both pieces in **5.12.0**. What's New entry covers the amend feature only — fixes never go in What's New, they go in the changelog. |

The staged-changes default deliberately differs from plain `git commit --amend`, which absorbs the
index. Silently swallowing files staged for the *next* commit is the classic amend footgun, and here
it would land on a rewrite the user cannot undo from the UI. The checkbox states the count, so the
staged work is visible rather than hidden — with the box unchecked the amend touches the message
only, and anything staged stays staged for the next commit.

## Behaviour

### Availability

The item appears on the row git currently has checked out, and — on badge menus — on the badge of the
branch that is checked out. It is available in detached HEAD (git amends there perfectly well), on a
merge commit (parents are preserved), and on a root commit. It never appears on a stash entry.

**Only that one badge can run it** *(revised 2026-08-25)*. `git commit` takes no branch argument: it
moves whatever HEAD points at. So when two branches sit on the tip, amending from the `feature` badge
would rewrite the checked-out branch and leave `feature` where it is — the menu would name one ref and
move another.

The other **local branch** badges on that tip still show the item, **disabled**, labelled
`Amend Last Commit... (current branch only)` and carrying a tooltip naming which branch would actually
move. Present on one branch badge and absent on the one beside it is the shape that reads as a bug —
the same reason every operation-dependent item here is disabled rather than hidden. The tooltip points
at where the amend *can* be run from, since it is available on that very row; a refusal that stops at
"no" only sends the user hunting for something already in front of them.

Remote-tracking, tag and stash badges leave it out entirely. Amending a tag is not a thing, so those
menus never invited the reading and a permanently dead item in them would be noise rather than an
explanation. In detached HEAD no branch badge is the checked-out one, so every branch badge on the tip
shows the disabled form; the row menu still runs it.

While a rebase, merge, revert or cherry-pick is in progress the item is **disabled, not hidden** —
the house rule for every operation-dependent item, so an option never vanishes during a refresh. No
reason text is shown, matching the items around it. This is one of the few places Speedy Git
deliberately imposes a rule git does not, and the reason is that git has no single rule of its own to
match here (see *Why all four are blocked*).

The webview's knowledge of an in-progress operation is only as fresh as the last refresh, so the
backend check stays too: an operation started in a terminal a moment ago leaves the item enabled, and
that is the case the backend refusal exists for — not the normal path.

### The dialog

- **Message** — a multi-line field, prefilled with the commit's *complete* existing message, subject
  and body, exactly as git stores it. The dialog must not reflow, re-wrap or trim a message the user
  did not edit. Confirming with an empty message is not allowed.
- **Include staged changes** — shown only when something is staged, with the file count in the label.
  Off by default. Off means the message alone changes and staged files stay staged; on means the
  staged files are folded into the amended commit.
- **Published warning** — when the commit being amended already exists on a remote, an inline warning
  says so and explains that amending rewrites it and will require a force push. It is a warning, not
  a block: Speedy Git does not veto anything git itself would accept.
- **Signature note** — when the commit carries a signature, an inline note says that amending
  replaces it: re-signed with the user's own key if they sign, unsigned otherwise. This is the one
  consequence a user can *see* afterwards — the Signature column changes — so it is the one worth
  saying out loud. It applies to your own signed commits as much as to anyone else's.
- **Force Push after amended** — a checkbox, default off, meaning `--force-with-lease`. Shown only
  when the commit being amended is published on a remote **and the checked-out branch has a remote
  counterpart of its own** *(revised 2026-08-25)*. Hidden in detached HEAD, when there are no remotes,
  and when the commit was never pushed — in that last case its absence is itself the signal that this
  commit is yours alone.

  The second half of that condition is not redundant. "Is the commit published" and "is the branch
  published" come apart whenever an unpublished branch shares a tip with a published one: the commit
  is on `origin/main`, the checked-out `feature` is on no remote at all. Offering a force push there
  would publish `feature` for the first time — under a label that says force push, on a branch whose
  absence of a remote is exactly what made it private. The published *warning* is gated on the same
  pair, because in that case this branch's amend rewrites nothing that is out there: the published
  copy stays untouched on its own ref, so "you will need to force push" would simply be untrue.
- **Command preview** — the dialog shows the git command it will run, in the same style every other
  Speedy Git operation dialog does, and the preview updates live as the checkboxes change.

### HEAD moving out from under the dialog

`git commit --amend` has no target — it rewrites whatever HEAD is when it runs. The dialog, however,
shows one specific commit and prefills that commit's message. If HEAD moves in between, the two come
apart, and the result is silent: the old commit's message is written onto a *different* commit,
destroying that commit's message and leaving the intended one untouched and out of reach.

This is not hypothetical here. Commit creation is delegated to VS Code's SCM view, so users are
committing from another panel in the same window while the graph is open. A terminal, a second
window, or a branch checkout does it too.

So the commit's identity is captured when the dialog opens and verified immediately before the amend
runs. On a mismatch the amend does **not** happen; the dialog stays open with what the user typed
intact and says HEAD has moved and the dialog must be reopened to amend the current tip. Nothing is
re-targeted automatically — someone reaching for Enter will not read a banner explaining that the
commit under the operation just changed.

Keeping the dialog open is the rule for **every** failure, not only this one *(review 2026-08-25)*: a
hook that rejects the message at second 40 must not take the message with it. The dialog closes on
success and on cancel-the-dialog, never on an error.

### While it runs

Committing runs `pre-commit` and `commit-msg` hooks — including for a message-only reword, since git
does not skip hooks just because the tree is unchanged. In repos with husky/lint-staged this takes
tens of seconds, and hook output is not visible to the user.

- Amend gets a **60-second ceiling** instead of the usual 30, which covers ordinary lint-staged
  setups while still failing reasonably fast on something stuck.
- After about **3 seconds** the dialog shows a **"waiting on hooks"** state, so the pause reads as the
  repo's own tooling rather than as a frozen extension. Fast repos never see it.
- That state carries a **Cancel** button. The ceiling is deliberately short, so Cancel is what keeps a
  genuinely slow hook from being a dead end.
- Cancel and the ceiling both end our *wait*, and neither can state the outcome from first
  principles. Hooks run before the commit is written, so **almost always** nothing was created — but
  killing git in the window between the commit object being written and the process exiting leaves
  the amend done. "Did my history get rewritten or not?" is the worst state to leave a user in, and
  an assumption that is wrong one time in a hundred is exactly how a user ends up there. So the
  outcome is **observed, not assumed**: after cancelling or timing out, HEAD is re-read and compared
  with the commit the dialog was opened against, and the message says which of the two actually
  happened *(review 2026-08-25)*.
- Either way the message must also say that the hook process itself keeps running — we stopped
  waiting on it, we did not stop it. Tools like lint-staged may still be modifying files afterwards.

### After confirming

- The commit's identity changes, so the graph refreshes and the selection follows to the new tip
  rather than being dropped.
- Success is **quiet** — no recovery hint, no toast about the reflog, consistent with every other
  operation in the extension.
- If force push was requested, it happens as a **second, separate step** after the amend succeeds.
  This means the two can split, and the outcome reporting must say which happened: an amend that
  succeeded followed by a rejected push is "amended locally, force push rejected", never "amend
  failed". The user must never be left guessing whether their commit was rewritten.
- A `--force-with-lease` rejection reaches us from git as `stale info`, which is accurate and
  useless. It is translated into something a person can act on: the remote moved since the last
  fetch, so fetch and look before force pushing.
- Git's own error output is surfaced as-is on other failures.

## Command preview

Every operation dialog in Speedy Git shows the command it is about to run, and amend is a
particularly good candidate because the two checkboxes map to real, learnable git behaviour:

| Dialog state | Preview shows |
| --- | --- |
| Message only | the amend command in its "leave the index alone" form |
| Include staged changes | the plain amend form, which takes the index in |
| Force Push after amended | a second line, showing `--force-with-lease` explicitly |

The preview is the only place the force-push flavour is stated, since the checkbox label is
deliberately plain. It updates live as the checkboxes change.

## Telemetry

Amend is a user-initiated git operation and gets the same treatment as every other one:

- A tracked operation event for the amend itself, with outcome and duration.
- A dialog outcome event — confirmed or cancelled — for the open/close cycle.
- The two options (include-staged, force-push) surfaced as their own **catalog UI actions**, emitted
  on confirm only when the box was checked *(review 2026-08-25)*. They are not properties on the
  amend event: the operation event carries a fixed property set, so there is nowhere to hang them.
  The ratio of message-only rewords to content amends stays derivable — a plain amend emits neither
  action, so the operation count is the denominator. What this shape gives up is the *pairing*: the
  two arrive as independent counts, so an amend that used both options cannot be told from two amends
  that each used one. That is accepted rather than worked around.
- The force push, if it runs, reports as the existing push operation — it is not folded into the
  amend's own outcome, which keeps the split-outcome case legible in the data.

Worth watching once shipped: how often amend fails on the 60-second ceiling or is cancelled (the
ceiling is a judgement call the data can correct), and how often a lease rejection occurs.

Never recorded: the message, the file count, branch or remote names, hashes, or anything else derived
from repository content. The telemetry catalog document is updated in the same change.

## Prerequisite defect: reword drops the commit body

The interactive-rebase **reword** field prefills with the commit's *subject only*. Whatever sits in
that box becomes the commit's entire new message, so rewording a multi-paragraph commit silently
discards its body and any trailers. Nothing in the codebase reads a commit's complete raw message
today, which is why the bug exists and why amend needs the same capability.

It is **built first**, as its own change, because it introduces the full-message read that amend then
consumes rather than inventing. It **ships in the same release** as amend, documented in the
changelog only — it is not mentioned in the What's New dialog at all, since that dialog carries new
features and never fixes.

## Why all four in-progress states are blocked

Tested directly, because "match git" needs a git behaviour to match, and here there isn't one:

| In-progress state | Reword only | Amend with staged changes |
| --- | --- | --- |
| Merge | git refuses: `cannot amend` | refused |
| Cherry-pick | git refuses: `cannot amend` | refused |
| Revert (conflicted) | **succeeds — and silently deletes the revert state** | refused (unmerged files) |
| Rebase `edit` stop | succeeds — the intended workflow | succeeds |

The revert row is the reason for the rule. In a conflicted revert, a message-only amend rewrites the
previous commit *and* clears `REVERT_HEAD`, while the working tree still holds conflict markers — so
the revert can no longer be continued or aborted, and the user is left in a state no git command
names. Inheriting that inconsistency would mean three different answers to one question. Blocking all
four is one rule a user can hold in their head, matches every other operation in the extension, and
costs only the rebase edit-stop case, which Speedy Git does not expose anyway.

If the rebase edit-stop workflow is ever built, this rule is the thing to reopen.

## Release plan

`v5.11.0` is already tagged, so both pieces land in **5.12.0**:

- The reword body-loss fix — built first, changelog only.
- Amend Last Commit — with a **What's New entry**, covering the item itself, the include-staged
  checkbox and the force-push option, and setting expectations about rewriting published commits.

The What's New entry describes the **new feature only**. Fixes never appear in it — not the reword
fix, not any other — regardless of how significant they are. The changelog is where fixes are
recorded; the dialog exists to introduce what is new, not to report what was wrong. As always, the
final content and whether the dialog shows at all is settled in the maintainer's pre-release What's
New pass, not decided from this document.

## Left for the implementation spec

- The exact wording of the HEAD-moved refusal, the lease-rejection message, and the
  hook-timeout/cancel message.
- Everything technical: where amend lives as a service, the command forms and how the message is
  passed, the RPC shape, which pure utils are extracted and tested, and the telemetry catalog entries.

## Not now, but shaped by this

Rewording a non-HEAD commit would reuse this exact dialog and dispatch to the existing rebase reword
engine, short-circuiting to amend when the target happens to be HEAD. Keeping the dialog's message
handling honest about full messages is what makes that later step cheap.

`--no-verify` (skip hooks) stays out of scope. If hook slowness becomes a recurring complaint, that is
the lever, and the 60-second ceiling is where the pressure will show up first.
