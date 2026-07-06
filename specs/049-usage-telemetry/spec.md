# Feature Specification: Anonymous Usage Statistics Collection

**Feature Branch**: `049-usage-telemetry`
**Created**: 2026-07-06
**Status**: Draft
**Input**: User description: "read @specs/049-statistic-collection-idea.md , create new branch from dev branch." (idea document: `specs/049-usage-telemetry/049-statistic-collection-idea.md`)

## Overview

Speedy Git currently ships with zero visibility into real-world usage. The maintainer cannot answer basic product questions: which editors and operating systems users run, which features are actually used (and which are dead weight), which errors users hit in the wild, or how the extension performs on real repositories. This feature adds **anonymous, aggregate-only usage statistics** collection, governed by three hard constraints:

1. **Zero confidential data** — no repository names, branch names, commit content, file paths, or user identity. Only anonymous, aggregate-able statistics.
2. **Zero performance impact** — collection must never affect how the extension performs or feels; everything is fire-and-forget and off the critical path.
3. **Invisible to the user** — completely silent. No notifications, prompts, or consent dialogs, ever. The user's existing editor-wide telemetry preference is honored automatically; transparency is provided passively through written disclosure.

## Clarifications

### Session 2026-07-06

- Q: Which UI interactions make the first-cut tracking allowlist? → A: All context-menu items + all toolbar buttons + dialog confirm/cancel + panel toggles + column show/hide; nothing else.
- Q: What is the scope of the standalone `error` event, given tracked operations already report `outcome: error` + error code? → A: Standalone `error` events cover only failures outside tracked operations (background fetches, watcher errors, internal service errors); tracked-operation failures are reported solely via the `operation` event — each failure counted exactly once.
- Q: What telemetry visibility appears in the Output log? → A: A dedicated telemetry output channel logs every sent event (name + properties) plus one status line at activation stating whether telemetry is enabled/disabled and why. Silent unless the user opens the Output panel.
- Q: Should the settings snapshot fire on every activation or only when settings changed? → A: Every session — one snapshot at each activation (stateless, directly queryable per period).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Feature Usage Visibility (Priority: P1)

As the extension maintainer, I can see which git operations and features users actually perform (e.g., how often Interactive Rebase is used vs Cherry-pick), whether each operation succeeded or failed, and how long it took — so I can prioritize development effort on features people use and fix the failures they actually hit.

**Why this priority**: This is the core motivation for the feature. Without operation-level usage data, every other insight is secondary; with it, the maintainer can immediately answer "what do people use?" and "what breaks?".

**Independent Test**: Perform a set of user-initiated git operations (checkout, merge, tag creation, rebase) in a production build with telemetry enabled; verify each produces exactly one usage record containing the operation identifier, outcome, standardized error code (on failure only), and duration — and nothing else.

**Acceptance Scenarios**:

1. **Given** telemetry is enabled, **When** a user completes a user-initiated git operation (e.g., merge a branch), **Then** a usage record is captured with the operation identifier, a success outcome, and the operation duration.
2. **Given** telemetry is enabled, **When** a git operation fails, **Then** the usage record contains the operation identifier and a standardized error code only — never the raw error message, which may embed paths or branch names.
3. **Given** telemetry is enabled, **When** high-frequency background data fetches occur (loading commits, scrolling, avatar lookups, auto-refresh), **Then** no usage records are produced for them.

---

### User Story 2 - Respecting User Choice (Opt-Out) (Priority: P1)

As a privacy-conscious user, my existing editor-wide telemetry preference is honored without me doing anything, and I additionally get an extension-specific setting to turn off Speedy Git's statistics independently — discoverable in the standard settings UI alongside other telemetry settings.

**Why this priority**: Honoring user consent is a hard requirement, not a nice-to-have. Shipping collection without correct opt-out behavior would violate marketplace guidelines and user trust; it must work from day one.

**Acceptance Scenarios**:

1. **Given** the user has set their editor's global telemetry level to "off", **When** they use any Speedy Git feature, **Then** no data is transmitted, with no code change or extra action required from the user.
2. **Given** the global telemetry level permits usage data, **When** the user disables the extension-specific telemetry setting, **Then** no data is transmitted.
3. **Given** the extension-specific setting is enabled, **When** the global telemetry level says no, **Then** nothing is sent — the extension setting can only further restrict, never override, the global choice.
4. **Given** the user changes their telemetry preference mid-session, **Then** the new preference takes effect without requiring a restart.
5. **Given** any combination of settings, **When** the user works with the extension, **Then** they never see a telemetry-related notification, prompt, dialog, or status-bar message.

---

### User Story 3 - Environment & Reach Insight (Priority: P2)

As the extension maintainer, I can see the anonymous distribution of user environments — operating system, editor product (VS Code, Cursor, Windsurf, VSCodium, …), editor version, extension version, and approximate distinct-user counts — so I can decide which platforms to test and support.

**Why this priority**: Environment questions ("what OS/IDE do our users run?") were an explicit motivation, and most of this arrives automatically with each event once User Story 1 exists; the increment is identifying the editor product, which standard properties alone don't reveal.

**Independent Test**: Trigger events from different editor products (VS Code and at least one fork) and verify each record identifies the editor product, host type, and platform; verify distinct-user counts are derived from an anonymized random identifier, not any real identity.

**Acceptance Scenarios**:

1. **Given** the extension activates in any supported editor, **When** a session's first event is recorded, **Then** the record identifies the editor product name, host kind, OS, and extension version.
2. **Given** collected records, **When** counting distinct users, **Then** the count is based on an anonymized random machine identifier that cannot be traced back to a person.

---

### User Story 4 - UI Interaction & Dialog Outcomes (Priority: P3)

As the extension maintainer, I can see which UI surfaces are used — which context-menu items are clicked, which toolbar buttons are pressed, and whether operation dialogs are confirmed or cancelled — so I can find undiscovered features, remove dead UI, and spot dialogs users abandon.

**Why this priority**: Valuable product insight, but it requires instrumenting interactions that never reach the backend, making it a larger surface than User Stories 1–3. The feature is viable without it.

**Independent Test**: Open a commit context menu, click a menu item, open an operation dialog and cancel it; verify each produces a usage record identifying only the surface and action from a fixed catalog — and that interactions outside the catalog produce nothing.

**Acceptance Scenarios**:

1. **Given** telemetry is enabled, **When** a user clicks a tracked context-menu item or toolbar button, **Then** a record is captured identifying the surface and the action from a fixed, closed catalog.
2. **Given** telemetry is enabled, **When** a user confirms or cancels an operation dialog, **Then** a record captures which dialog and which outcome — never any values the user typed into the dialog.
3. **Given** a UI interaction report arrives that is not in the fixed catalog, **Then** it is discarded at the collection funnel and nothing is recorded.
4. **Given** high-frequency interactions (scrolling, hovering, keystrokes, row selection), **Then** they are never instrumented.

---

### User Story 5 - Configuration & Health Signals (Priority: P3)

As the extension maintainer, I can see an anonymous snapshot of which extension settings users run (e.g., date format choice, avatars on/off, view mode) and coarse performance/health signals (activation time, initial load time, repository-size buckets) — so I can decide which options are worth keeping and catch performance regressions in the wild.

**Why this priority**: Useful for long-term product decisions, but the lowest-urgency insight; it refines decisions rather than enabling them.

**Independent Test**: Activate the extension with a known settings combination and verify a once-per-session snapshot records those option values (from closed sets) plus numeric measures; verify repository size appears only as a bucket (e.g., 500 / 1k / 5k / 10k+), never an exact count.

**Acceptance Scenarios**:

1. **Given** telemetry is enabled, **When** a session starts, **Then** at most one settings snapshot is recorded per session, containing only option choices from closed sets and numeric configuration values.
2. **Given** performance signals are recorded, **When** repository size is included, **Then** it is expressed as a coarse bucket, never an exact commit count.

---

### Edge Cases

- **Global telemetry off / extension setting off**: nothing is transmitted; the extension behaves identically otherwise (see US2).
- **Build without a collection destination configured** (development builds, test runs, or a release built without the destination value): the telemetry component becomes an inert no-op — zero overhead, no errors, no behavior change.
- **Collection backend unreachable / network failure**: fully silent — no user-visible error, no retry storms, no impact on any git operation or UI flow.
- **Telemetry component itself throws**: failures are swallowed; no telemetry error may ever surface to the user or affect an operation.
- **Extension deactivation with unsent events**: pending events are flushed on shutdown without delaying or blocking deactivation noticeably.
- **Malformed or out-of-catalog interaction reports from the UI layer**: re-validated at the single collection funnel and dropped (the funnel never trusts the UI layer's input verbatim).
- **Development/debug sessions (F5)**: excluded from statistics so maintainer activity doesn't pollute the data.
- **Data that could fingerprint a user via exact values** (e.g., exact commit counts): reported only as coarse buckets.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST record a usage event for each user-initiated git operation, capturing the operation identifier (from a closed set), the outcome (success/error), the standardized error code on failure (never the error message), and the duration.
- **FR-002**: The system MUST exclude high-frequency, non-user-initiated requests (commit loading, pagination, detail fetches, avatar and signature lookups, auto-refresh) from usage recording via an explicit allowlist of tracked operations.
- **FR-003**: The system MUST honor the editor's global telemetry level automatically: nothing is sent when telemetry is off; only error events at error/crash levels; usage events only at the full level. Changes to the level MUST take effect without restart.
- **FR-004**: The system MUST provide an extension-specific telemetry on/off setting (default: on) that is discoverable in the editor's standard telemetry settings view. Telemetry is sent only when **both** this setting **and** the editor's global telemetry preference allow it — the extension setting can only further restrict, never override, the global preference. The setting's description MUST include a note stating this dual-consent rule explicitly in original wording (e.g., "Anonymous usage statistics are sent only when this setting and VS Code's global telemetry setting are both enabled — turning either off stops all collection."), so users understand the relationship directly from the Settings page.
- **FR-005**: The system MUST NEVER collect: repository names/paths/remote URLs; workspace folder names; branch/tag/stash/worktree names; commit hashes, messages, or diffs; author names, emails, or avatars; git configuration values; file names or paths; raw git output or exception messages; search/filter text or dates; anything typed by the user into any input.
- **FR-006**: The privacy contract in FR-005 MUST be enforced structurally: event names and property values are drawn from closed, typed catalogs (no free-form strings accepted), and every event passes through a single collection funnel that re-validates incoming reports against the catalog before recording.
- **FR-007**: All collection MUST be fire-and-forget: no user-facing flow, rendering path, request handler, or activation sequence may wait on telemetry work, and no instrumentation may be added to hot paths (scroll, hover, keystroke, auto-refresh).
- **FR-008**: The system MUST be completely silent: no notifications, dialogs, prompts, consent requests, or status-bar messages related to telemetry, ever. Diagnostic output to the extension's output log is the only permitted visibility.
- **FR-008a**: The system MUST provide a dedicated telemetry output channel that logs every sent event (event name + properties) and one status line at activation stating whether telemetry is enabled or disabled and why (e.g., global setting off, extension setting off, no destination configured). This channel serves as live passive transparency and never draws attention to itself (no auto-show, no badges).
- **FR-009**: All outbound telemetry MUST leave from the extension's backend process through the single funnel; the UI layer MUST NOT communicate with any external collection service directly (its content-security policy stays fully strict).
- **FR-010**: The UI layer MUST report its interactions (tracked menu items, toolbar buttons, dialog confirm/cancel, panel toggles, column visibility changes) to the backend via a one-way, fire-and-forget message that never blocks the UI and expects no response.
- **FR-011**: Each event MUST carry environment context sufficient to answer distribution questions: editor product name, host kind, UI kind, OS/platform, editor version, extension name and version, and an anonymized random machine identifier for distinct-user counting.
- **FR-012**: The system MUST record, per session: one activation event (with activation duration and repository count), one settings snapshot (option choices from closed sets plus numeric values), and sampled performance events (initial load and graph computation durations with repository-size buckets).
- **FR-013**: Numeric values that could fingerprint a user via exact magnitudes (e.g., commit counts) MUST be reported as coarse buckets; simple counts (e.g., number of repositories) MAY be exact.
- **FR-014**: Error events MUST identify only the functional area and the standardized error code — never messages, stack traces, or any content derived from user data. Standalone error events cover only failures occurring outside tracked operations (background fetches, watcher errors, internal service errors); failures of tracked operations are reported solely via the operation event's error outcome, so each failure is counted exactly once.
- **FR-015**: Development builds, test runs, debug sessions, and any build lacking a collection destination MUST behave as an inert no-op: zero overhead, zero transmission, no errors, and no null-handling burden at call sites.
- **FR-016**: Telemetry failures of any kind (network, backend, internal) MUST be swallowed silently and MUST NOT affect any user operation.
- **FR-017**: Pending events MUST be flushed when the extension shuts down, without noticeably delaying deactivation.
- **FR-018**: The system MUST provide passive written transparency: a published document listing exactly what is collected and what is never collected, how to opt out, plus a machine-readable event manifest that surfaces in the editor's standard telemetry transparency inspection.
- **FR-019**: The collection destination credential MUST be kept out of the source repository (it is not a secret, but casual copy-paste misuse is discouraged); a missing credential MUST safely produce the no-op behavior of FR-015. Abuse protection (data pollution, cost inflation) is handled by a service-side daily ingestion cap, outside implementation scope.

### Key Entities

- **Usage Event**: One anonymous record of something that happened — an activation, a git operation, a UI interaction, a dialog outcome, a settings snapshot, a performance sample, or an error. Carries a name from the closed catalog, categorical properties from closed sets, and numeric measurements. Never contains free text.
- **Event Catalog (allowlist)**: The closed, reviewable vocabulary of every event name, property, and permitted value. Extending telemetry means extending this catalog, making every addition visible in code review. Doubles as the validation reference at the collection funnel and the basis of the transparency manifest.
- **Privacy Contract**: The enumerated list of data classes that are never collected (FR-005), published in user-facing documentation and enforced structurally by the catalog.
- **Consent State**: The effective permission to send data, combining the editor's global telemetry level and the extension-specific setting; the most restrictive of the two always wins.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Within one release cycle of shipping, the maintainer can answer — from collected data alone — the four motivating questions: OS/editor distribution, feature usage frequency ranking, error frequency by standardized code, and coarse load-performance distribution.
- **SC-002**: With telemetry disabled (globally or via the extension setting), zero telemetry records are transmitted — verifiable by network inspection over a full working session.
- **SC-003**: Users experience zero telemetry-related UI: no prompt, notification, dialog, or status-bar message appears in any session, including first activation.
- **SC-004**: No measurable performance regression: activation time and graph load time with telemetry enabled are indistinguishable from the prior release (within normal run-to-run variance) on the standard test repository.
- **SC-005**: 100% of transmitted event names and property values come from the published catalog; auditing any sample of collected records reveals zero free-text values and zero items from the never-collect list.
- **SC-006**: A privacy-conscious user can locate the opt-out setting via the editor's standard telemetry settings filter and disable collection in under a minute, without documentation.
- **SC-007**: Collection volume at current user scale stays within the collection service's free tier indefinitely (no high-frequency events exist to inflate it).

## Assumptions

- **Consent baseline**: honoring the editor's existing global telemetry preference plus an extension-level opt-out (default on) with passive written disclosure is a sufficient consent model; no first-run notification will be shown. The idea document floated an optional one-time notification (open question 4), but it conflicts with the hard "invisible to the user" constraint — resolved as **no notification**.
- **First-cut UI interaction catalog** (idea document open question 1, confirmed in clarification 2026-07-06): every context-menu item, every toolbar button, every dialog confirm/cancel, panel toggles, and column show/hide — nothing else. Scroll, hover, keystroke, row selection, and auto-refresh are permanently excluded.
- **Settings snapshot cadence** (idea document open question 2, confirmed in clarification 2026-07-06): once per session on activation. Simple to reason about and query; deduplicating "only when changed" adds state for negligible volume savings.
- **Technical direction is pre-decided** in the idea document and validated there: the official editor telemetry module (`@vscode/extension-telemetry` ^1.5.2) with an Azure Application Insights backend, a connection string held in a local gitignored `.env` injected at production build time only, and a `TelemetryService` funnel wrapping the router's dispatch. These are planning-phase inputs, not open spec questions.
- **Collection service provisioning** (Azure resource, dashboards, ingestion cap, starter queries) is owned by the maintainer and out of implementation scope; implementation only needs the destination value present at production build time.
- **Publishing flow is local** (`pnpm ext:publish` runs a production build), so every published artifact embeds the destination value when the local `.env` is present; a missing value ships a telemetry-off build, which is the safe default.
- **Volume scale**: current install base is small enough that no sampling strategy is needed beyond "no high-frequency events".

## Out of Scope

- Any custom or self-hosted collection endpoint.
- Crash/stack-trace reporting, session replay, A/B testing, or remote configuration.
- Collecting anything typed by the user, ever.
- Direct telemetry from the UI layer (would require loosening its content-security policy).
- Collection-service provisioning, dashboards, and query building (maintainer-owned).
- Any consent prompt, notification, or other user-visible telemetry UI.
