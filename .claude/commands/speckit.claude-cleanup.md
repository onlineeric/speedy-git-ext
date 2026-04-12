---
description: Clean up redundant entries in CLAUDE.md Active Technologies and Recent Changes sections after speckit workflows.
---

## User Input

```text
$ARGUMENTS
```

Consider any user-provided hints before proceeding.

---

## Goal

The `update-agent-context.sh` script appends a new "Active Technologies" entry for every speckit feature branch, even when the project's core tech stack hasn't changed. This creates redundant, noisy entries. This command cleans up CLAUDE.md by deduplicating those sections.

## Execution Steps

### 1. Read CLAUDE.md

Read the full `CLAUDE.md` file to understand the current state of all sections.

### 2. Clean up "Active Technologies"

- Deduplicate entries: the project has ONE tech stack, not one per feature branch.
- Collapse all per-branch entries into a single line that accurately describes the project's actual technology stack.
- Use the **Technology Stack Constraints** table in `.specify/memory/constitution.md` and the **Tech Stack** section in `CLAUDE.md` as the source of truth for what technologies are in use.
- Remove per-branch tags like `(035-text-filter)`, `(039-uncommitted-node-ux2)` etc.
- Remove "Storage" / "N/A" entries — these describe per-feature transient state, not project-level technologies.
- The result should be a single bullet point (or very few if genuinely different stacks exist for different layers), e.g.:
  ```
  - TypeScript 5.x (strict) + React 18, Zustand, Radix UI, Tailwind CSS (webview); esbuild (extension host), Vite (frontend)
  ```

### 3. Clean up "Recent Changes"

- Keep only the **3 most recent** feature entries.
- Each entry should describe **what the feature did**, not re-list the tech stack.
- Format: `- <branch-name>: <short description of what changed>`
- Derive descriptions from the feature's spec or plan if available, or from git log messages.

### 4. Preserve everything else

- Do NOT modify any other section of CLAUDE.md.
- Do NOT remove manually written content outside the "Active Technologies" and "Recent Changes" sections.

## Operating Constraints

- This command modifies CLAUDE.md only.
- If the sections are already clean (no duplicates, reasonable number of entries), report that no changes are needed and skip editing.
