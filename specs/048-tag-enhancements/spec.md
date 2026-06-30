# Feature Specification: Tag Enhancements

**Feature Branch**: `048-tag-enhancements`  
**Created**: 2026-06-30  
**Status**: Draft  
**Input**: User description: "read @specs/048-tag-enhancement-idea.md, create new branch from dev branch."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what a tag actually says (Priority: P1)

A developer hovers over a tag badge on a commit in the graph. Today the badge
shows only the tag name, even when the tag was created with an annotation
message, tagger, and date. The developer wants to read that annotation (for
example, a release note like "v2.1.0 — hotfix for login timeout") without
leaving the graph or running a terminal command.

**Why this priority**: This is the most broadly useful, lowest-risk
enhancement. It is purely a local read (no network, no destructive action), it
fixes the "write-only annotation" dead-end where the message we collect is never
shown again, and every user who looks at tags benefits — not just those who push
or delete them.

**Independent Test**: Create an annotated tag with a known message in a test
repo, open the graph, and confirm the tag badge tooltip shows the annotation
message, tagger name, and tag date. Create a lightweight tag and confirm the
tooltip reflects that it has no annotation. Delivers value on its own with no
dependency on the other stories.

**Acceptance Scenarios**:

1. **Given** an annotated tag with message, tagger, and date, **When** the user
   hovers over the tag badge, **Then** the tooltip shows the annotation message,
   the tagger's name, and the tag's date.
2. **Given** a lightweight tag (no annotation object), **When** the user hovers
   over the tag badge, **Then** the tooltip indicates the tag is lightweight and
   shows no annotation message (rather than showing stale or empty fields as if
   it were annotated).
3. **Given** a graph with many tags, **When** the user hovers over tag badges
   repeatedly, **Then** the tooltip appears instantly with no perceptible delay
   and no network activity.
4. **Given** the user refreshes the graph after a tag's annotation changes,
   **When** they hover over that tag again, **Then** the tooltip reflects the
   updated annotation metadata.

---

### User Story 2 - Create and push a tag in one step (Priority: P2)

A developer tags a release commit and, in the common case, wants that tag to
exist on the shared remote immediately. Today they create the tag, then have to
separately find the tag badge and choose "Push" — two actions for one intent.
The developer wants a single "create and push" flow, while still being able to
create a purely local tag when they choose to.

**Why this priority**: High-value convenience that removes a frequent
two-step dance, but it builds on existing create and push operations and is less
universally needed than simply reading tag metadata, so it ranks below P1.

**Independent Test**: In a repo with a remote, open the tag creation dialog,
enter a name, leave the "Also push to remote" option enabled, submit, and
confirm the tag exists both locally and on the remote. Repeat with the option
disabled and confirm the tag exists only locally.

**Acceptance Scenarios**:

1. **Given** a repo with at least one remote, **When** the user opens the tag
   creation dialog, **Then** an "Also push to remote" option is shown and
   enabled by default.
2. **Given** the "Also push to remote" option is enabled, **When** the user
   submits the dialog, **Then** the tag is created locally and then pushed to the
   default remote, and the command preview shows both the create and the push
   command before submission.
3. **Given** the "Also push to remote" option is disabled, **When** the user
   submits, **Then** the tag is created locally only and no push occurs.
4. **Given** a repo with no remote configured, **When** the user opens the tag
   creation dialog, **Then** the "Also push to remote" option is hidden or
   disabled and the dialog still allows creating a local tag.
5. **Given** the tag was created locally but the push fails (for example, no
   network or auth failure), **When** the operation reports back, **Then** the
   user is told the tag was created locally but the push failed, with the
   failure reason surfaced.

---

### User Story 3 - Delete a tag locally and from the remote (Priority: P2)

A developer wants to retire a tag that has already been pushed. Today delete is
local-only, so the tag lingers on the remote with no in-app way to remove it.
The developer wants to delete the tag locally and, by default, also remove it
from the remote in the same action — without the action failing just because the
tag was never on the remote in the first place.

**Why this priority**: Closes the third dead-end and completes the
local/remote symmetry, but it is a destructive action used less frequently than
reading metadata, so it shares P2 rather than P1.

**Independent Test**: Push a tag, then delete it via the new delete dialog with
"Also delete from remote" enabled, and confirm it is gone both locally and on the
remote. Separately, delete a purely local tag with the option enabled and confirm
the local delete succeeds and the missing-remote-tag case is treated as a benign
no-op rather than an error.

**Acceptance Scenarios**:

1. **Given** a tag that exists locally and on the remote, **When** the user
   deletes it with "Also delete from remote" enabled, **Then** the tag is removed
   both locally and from the remote.
2. **Given** a tag that exists locally but not on the remote, **When** the user
   deletes it with "Also delete from remote" enabled, **Then** the local delete
   succeeds and the absence of the remote tag is treated as a benign no-op (not
   reported as a failure).
3. **Given** the remote delete fails for a genuine reason (auth, no network,
   permission denied), **When** the operation reports back, **Then** that failure
   is surfaced to the user rather than swallowed.
4. **Given** a repo with no remote configured, **When** the user opens the tag
   delete dialog, **Then** the "Also delete from remote" option is hidden or
   disabled and a local-only delete is still available.
5. **Given** the delete dialog, **When** it is shown, **Then** it follows the
   same local/remote checkbox pattern already used for deleting branches.

---

### User Story 4 - Force-push a tag that diverged on the remote (Priority: P3)

A developer needs to push a tag whose name already exists on the remote pointing
at a different commit. A normal push is rejected in that case. The developer
wants an explicit, opt-in "Force" option on the push paths to overwrite the
remote tag, while keeping force off by default so it is never applied
accidentally.

**Why this priority**: An edge-case escape hatch for an uncommon situation;
valuable when needed but not part of the everyday flow, so it ranks lowest.

**Independent Test**: With a tag that points at a different commit on the remote
than locally, attempt a normal push and observe rejection, then retry with the
"Force" option enabled and confirm the remote tag is updated to the local commit.

**Acceptance Scenarios**:

1. **Given** any tag-push path (the create-and-push flow and the standalone push
   action), **When** the relevant dialog is shown, **Then** a "Force" option is
   offered and is unchecked by default.
2. **Given** the "Force" option is enabled, **When** the user pushes, **Then**
   the push overwrites the remote tag and the command preview reflects the forced
   push before submission.
3. **Given** the "Force" option is left unchecked, **When** the user pushes a tag
   that diverges on the remote, **Then** the push is rejected and the rejection is
   surfaced to the user.
4. **Given** the delete and create flows, **When** their dialogs are shown,
   **Then** no "Force" option is offered there (force applies only to push).

---

### Edge Cases

- **Lightweight vs annotated**: Lightweight tags have no annotation object,
  tagger, or message. The tooltip must distinguish these from annotated tags
  rather than showing empty or misleading annotation fields.
- **No remote configured**: Both the create and delete dialogs must degrade
  gracefully — the remote-related options are hidden or disabled, and local-only
  create/delete still work.
- **Multiple remotes**: When more than one remote exists, the push and
  create-and-push flows target a single default remote chosen by the existing
  default-remote rule (origin if present, otherwise the first alphabetically).
- **Create succeeds but push fails**: The local tag still exists; the user must
  be told the create succeeded and the push did not, with the reason.
- **Remote tag already absent on delete**: Treated as success for the remote
  portion (benign no-op), not an error — but only git's specific
  "remote ref does not exist" outcome is swallowed; any other failure surfaces.
- **Tag annotation changes between refreshes**: Cached tooltip metadata must be
  invalidated on refresh so stale annotations are not shown.
- **Tag names with unusual characters**: Names containing slashes or other
  special characters must round-trip correctly through display, push, and delete
  without corruption.

## Requirements *(mandatory)*

### Functional Requirements

#### Tag metadata visibility (Story 1)

- **FR-001**: System MUST read tag annotation metadata — annotation message,
  tagger name, tag date, and annotated-vs-lightweight classification — using only
  local repository data, with no network round-trips.
- **FR-002**: System MUST display the annotation message, tagger, and date of a
  tag in the tag badge tooltip when the tag is annotated.
- **FR-003**: System MUST distinguish annotated tags from lightweight tags in the
  tooltip, and MUST NOT present annotation fields for a tag that has no
  annotation object.
- **FR-004**: System MUST cache tag metadata so that hovering over tag badges is
  instant and does not re-read on every hover, and MUST invalidate that cache on
  graph refresh so updated annotations are reflected.
- **FR-005**: System MUST load tag metadata in a way that does not delay the
  initial graph render (loaded with deferred data rather than blocking).

#### Create and push in one action (Story 2)

- **FR-006**: The tag creation flow MUST offer an "Also push to remote" option
  that is enabled by default when at least one remote is configured.
- **FR-007**: When "Also push to remote" is enabled, the system MUST create the
  tag locally and then push it to the default remote, reusing the existing
  default-remote selection rule.
- **FR-008**: The tag creation dialog's command preview MUST show both the create
  command and the push command when "Also push to remote" is enabled, reflecting
  exactly what will run.
- **FR-009**: When no remote is configured, the system MUST hide or disable the
  "Also push to remote" option while still allowing a local tag to be created.
- **FR-010**: When the tag is created locally but the subsequent push fails, the
  system MUST report that the create succeeded and the push failed, including the
  failure reason, rather than reporting overall failure or silent success.

#### Delete locally and from remote (Story 3)

- **FR-011**: The tag delete flow MUST present a dialog (replacing the plain
  delete confirmation for tags) that offers an "Also delete from remote" option,
  enabled by default when a remote is configured, mirroring the established
  branch-delete local/remote pattern.
- **FR-012**: When "Also delete from remote" is enabled, the system MUST delete
  the tag locally and attempt to delete it from the default remote.
- **FR-013**: System MUST treat git's specific "remote ref does not exist"
  outcome of the remote delete as a benign no-op (the overall delete still
  succeeds), and MUST surface any other remote-delete failure (auth, network,
  permission) to the user.
- **FR-014**: When no remote is configured, the system MUST hide or disable the
  "Also delete from remote" option while still allowing a local-only delete.

#### Force on push paths (Story 4)

- **FR-015**: Every tag-push path — the create-and-push flow and the standalone
  push action — MUST offer a "Force" option that is unchecked by default.
- **FR-016**: When "Force" is enabled, the system MUST perform a forced push that
  overwrites a diverged remote tag, and the command preview MUST reflect the
  forced push.
- **FR-017**: System MUST NOT offer a "Force" option on the create-only or delete
  flows (force applies only to push).

#### Scope guards (Design principles)

- **FR-018**: System MUST NOT query remote tag state (no remote listing or host
  API calls); remote tag actions are "fire and report" only.
- **FR-019**: System MUST NOT provide a tag-move/retag capability (pointing an
  existing tag at a different commit) as part of this feature.

### Key Entities *(include if feature involves data)*

- **Tag metadata**: The information read locally for a tag — its name, whether it
  is annotated or lightweight, and (for annotated tags) the annotation message,
  tagger identity, and tag date. Surfaced primarily in the tag badge tooltip.
- **Remote target**: The single remote chosen for push and remote-delete actions,
  resolved by the existing default-remote rule (origin, else first alphabetical).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any annotated tag, a user can read its annotation message,
  tagger, and date directly from the graph (via the tag badge tooltip) without
  running any terminal command.
- **SC-002**: Hovering over a tag badge surfaces its metadata with no perceptible
  delay and with zero network activity, including on repeated hovers.
- **SC-003**: A user can create a tag and have it pushed to the remote in a single
  dialog submission, and the dialog shows both commands before the user commits to
  the action.
- **SC-004**: A user can remove a previously pushed tag from both local and remote
  in a single dialog submission, and deleting a local-only tag with the
  remote option enabled still succeeds without a spurious error.
- **SC-005**: A user can overwrite a diverged remote tag only when they explicitly
  opt into "Force", and force is never applied unless they enable it.
- **SC-006**: In a repository with no remote, every tag dialog still functions for
  local-only create and delete, with remote options hidden or disabled.
- **SC-007**: No tag action in this feature performs a remote query or a
  tag-move/retag operation.

## Assumptions

- The existing default-remote selection rule (origin if present, otherwise first
  alphabetical) is the correct target for push and remote-delete actions; a remote
  picker is out of scope for this round.
- Reusing the established UI patterns — command preview in dialogs, the
  branch-delete local/remote checkbox model — is preferred over introducing new
  interaction patterns.
- Tag signature presence/verification in the tooltip (reusing prior signature
  infrastructure) is a stretch goal and not required for this feature to be
  complete.
- Surfacing tag annotation metadata in the Commit Details panel is a stretch goal;
  the tag badge tooltip is the primary and required target.
- Out of scope for this round: moving/retagging, querying remote tag state,
  push-all-tags, fetch-tags, checkout-tag, and a dedicated tags list panel.
