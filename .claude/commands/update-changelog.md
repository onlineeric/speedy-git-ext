---
description: Update CHANGELOG.md for the current speckit feature branch. Reads the current version from package.json, confirms the target version with the user, summarizes changes from the active speckit spec, and writes a new changelog entry.
---

## User Input

```text
$ARGUMENTS
```

Consider any user-provided hints before proceeding.

## Goal

Append (or replace) a versioned entry in `CHANGELOG.md` by summarizing the current speckit feature spec into VSCode Extension changelog format.

---

## Execution Steps

### Step 1 — Read current version

Read `package.json` and extract the `"version"` field.

### Step 2 — Confirm target version with user

Use **AskUserQuestion** to ask:

> The current version in `package.json` is **X.Y.Z**. What version should this changelog entry be for? (Press Enter to use X.Y.Z, or type a different version.)

Use the user's answer as `TARGET_VERSION`. If the user provides no answer, use the version from `package.json`.

### Step 3 — Check for existing entry

Read `CHANGELOG.md` and check whether a section `## [TARGET_VERSION]` already exists.

If it **does** exist, use **AskUserQuestion** to ask:

> A changelog entry for **[TARGET_VERSION]** already exists. Do you want to replace it? (yes / no)

- If the user says **no** (or anything other than yes/y), print "Changelog update cancelled." and stop.
- If the user says **yes**, proceed — the existing entry will be replaced in Step 6.

### Step 4 — Identify active speckit feature branch

Run `git branch --show-current` from the repo root to get the current branch name.

Then look for a matching spec directory under `specs/` — the convention is `specs/<branch-name>/spec.md`. If the branch name does not match any directory, list `specs/` and pick the closest match, or ask the user to clarify.

### Step 5 — Read and summarize the spec

Read the spec file at `specs/<feature-dir>/spec.md`.

Summarize it into changelog entries following these rules:

**Extraction rules:**
- Derive entries from **User Stories**, **Functional Requirements**, and notable **edge case handling** described in the spec.
- Convert technical spec language into brief, simple, user-facing benefit statements (what the user can now do, not how it is implemented).
- Categorize each entry as one of: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security` (per Keep a Changelog convention).
- Most new feature specs will produce `Added` entries; bug/edge-case fixes go under `Fixed`.
- Keep each bullet concise: one line, starting with a verb phrase (e.g., "Configurable batch commit size via VS Code Settings...").
- Omit implementation details (file names, function names, internal architecture) unless they are directly user-visible.
- Omit items explicitly marked as out-of-scope in the spec.

**Format output as:**

```markdown
## [TARGET_VERSION] - YYYY-MM-DD

### Added
- ...

### Fixed  ← only include sections that have entries
- ...
```

Use today's date for `YYYY-MM-DD`.

### Step 6 — Write the entry to CHANGELOG.md

Read the full current content of `CHANGELOG.md`.

**If replacing an existing entry:** Remove the old `## [TARGET_VERSION]` section (from its heading line down to, but not including, the next `## [` heading or end of file), then insert the new entry in its place.

**If adding a new entry:** Insert the new entry immediately after the `## [Unreleased]` section (after its last line, before the next `## [` heading).

Write the updated content back to `CHANGELOG.md`.

### Step 7 — Confirm to user

Print a brief summary of what was written, e.g.:

> Added changelog entry for **[0.3.0]** with N items under `Added` and M items under `Fixed`.
