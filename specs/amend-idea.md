# Idea Spec: Amend Last Commit

Date: 2026-08-24
Status: Idea — open questions below to be clarified before an implementation spec is written.
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

Out of scope for this idea:

- Creating a new commit (a commit panel/box for staged changes).
- Rewording a commit that is not HEAD.
- Changing the author, resetting the author, skipping hooks, sign-off, co-authors, commit templates.
- Choosing *which* files are in the commit from inside the dialog — that is staging, and staging
  already exists on the uncommitted-changes node.

## Decisions already made

| Question | Decision |
| --- | --- |
| Entry point | HEAD commit row menu only. Not the uncommitted node, not the details panel. |
| Dialog shape | One "Amend Last Commit…" dialog: message field + "include staged changes" checkbox. |
| Staged changes default | **Off.** The dialog shows the staged count but never absorbs staged work unless asked. |
| Force push | A checkbox **inside** the dialog, default off, labelled "Force Push after amended". |

The staged-changes default deliberately differs from plain `git commit --amend`, which absorbs the
index. Silently swallowing files staged for the *next* commit is the classic amend footgun, and here
it would land on a rewrite the user cannot undo from the UI. The checkbox states the count, so the
staged work is visible rather than hidden — with the box unchecked the amend touches the message
only, and anything staged stays staged for the next commit.

## Behaviour

### Availability

The item appears on the row git currently has checked out, and nowhere else. It is available in
detached HEAD (git amends there perfectly well), on a merge commit (parents are preserved), and on a
root commit. It never appears on a stash entry.

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
- **Force Push after amended** — a checkbox, default off, offered only when there is something to
  force-push to (the commit is published and a remote/branch pair exists). Not shown otherwise.
- **Command preview** — the dialog shows the git command it will run, in the same style every other
  Speedy Git operation dialog does, and the preview updates live as the checkboxes change. It is a
  learning surface as much as a confirmation: the "include staged" checkbox is the visible difference
  between amending the index in and leaving it alone, and the force-push line shows the actual flag
  behind the friendly label.

### After confirming

- The commit's identity changes, so the graph refreshes and the selection follows to the new tip
  rather than being dropped.
- If force push was requested, it happens as a **second, separate step** after the amend succeeds.
  This means the two can split, and the outcome reporting must say which happened: an amend that
  succeeded followed by a rejected push is "amended locally, force push rejected", never "amend
  failed". The user must never be left guessing whether their commit was rewritten.
- Git's own error output is surfaced as-is on failure — including hook failures, which run on amend
  the same as on any commit.

## Telemetry

Amend is a user-initiated git operation and gets the same treatment as every other one:

- A tracked operation event for the amend itself, with outcome and duration.
- A dialog outcome event — confirmed or cancelled — for the open/close cycle.
- The two option booleans (include-staged, force-push) recorded as reviewed booleans, so the ratio of
  message-only rewords to content amends, and how often force push is chained, is visible.
- The force push, if it runs, reports as the existing push operation — it is not folded into the
  amend's own outcome, which keeps the split-outcome case legible in the data.

Never recorded: the message, the file count, branch or remote names, hashes, or anything else derived
from repository content. The telemetry catalog document is updated in the same change.

## Related defect found while designing this

The existing interactive-rebase **reword** field prefills with the commit's *subject only*, so
rewording a multi-paragraph commit through that dialog silently discards its body. Amend needs a
correct full-message read anyway; the same read fixes reword. Whether that fix rides along with this
feature or ships separately is an open question below.

## Open questions

1. **Fold in the reword body-loss fix?** Same underlying need (read the full raw message), but it
   touches the interactive rebase dialog. Ship it with amend, or as its own change?
2. **Amend while another operation is in progress.** Git itself allows `commit --amend` at a rebase
   `edit` stop. Speedy Git blocks every other mutating operation during an in-progress rebase, merge,
   revert or cherry-pick. Blocking is consistent but is a rule on top of git; allowing it is truer to
   git but exposes a rebase flow the extension does not otherwise support. Current lean: block.
3. **Force-push flavour.** Should the checkbox mean force-with-lease (refuses if the remote moved
   under you — the safer choice, and exactly what the amend case is for) or a plain force? Current
   lean: force-with-lease, with the real flag visible in the command preview.
4. **Force-push checkbox when the branch has no upstream.** Hide it, or offer it as a normal push?
   Current lean: only offer it when the commit is actually published.
5. **Hook timeouts.** Amend runs pre-commit and commit-msg hooks, and Speedy Git caps how long a git
   command may run. A slow hook will read as a hang. Accept for a first version, or surface a
   "waiting on hooks" state?
6. **Undo.** The pre-amend commit remains recoverable via reflog, but Speedy Git has no reflog UI, so
   there is no in-app undo. Is a "the previous commit is still in your reflog" hint worth showing
   after a successful amend, or does that belong to a future reflog feature?
7. **Amending a commit authored by someone else** (possible when the tip is not yours). Git keeps the
   original author and records you as committer. Leave it silent, or say so in the dialog?

## Not now, but shaped by this

Rewording a non-HEAD commit would reuse this exact dialog and dispatch to the existing rebase reword
engine, short-circuiting to amend when the target happens to be HEAD. Keeping the dialog's message
handling honest about full messages is what makes that later step cheap.
