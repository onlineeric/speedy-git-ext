# Research: UI Enhancements for Merge Dialog and Inline Code Rendering

**Date**: 2026-03-30

## R1: Inline Code Parsing Approach

**Decision**: Use a simple iterative string scanner that splits text on backtick pairs, returning an array of `{ text: string, isCode: boolean }` segments. Render segments as React elements — plain `<span>` for normal text, `<code>` with grey background for code.

**Rationale**:
- Commit messages are short (typically < 200 chars for subject, < 2000 for body)
- Only single-backtick inline code is needed (no triple-backtick blocks, no nested formatting)
- A simple scanner is more readable and maintainable than regex for this use case
- Returns React nodes directly so it integrates cleanly with JSX

**Alternatives considered**:
- **Regex-based replacement**: Rejected — constitution principle IV discourages regex for parsing; also harder to handle edge cases (unpaired backticks, empty pairs)
- **Full markdown parser (e.g., marked, remark)**: Rejected — massive overkill for single-backtick support; adds bundle size; would parse many markdown features we don't want rendered in commit messages

## R2: Inline Code Styling for VS Code Themes

**Decision**: Use `bg-[var(--vscode-textCodeBlock-background)]` for the grey background, falling back to a subtle opacity-based background if the variable is unavailable. Use `font-mono` and `text-[length:inherit]` to match surrounding text size.

**Rationale**:
- `--vscode-textCodeBlock-background` is the semantic VS Code theme variable for inline code backgrounds, ensuring correct appearance in both light and dark themes
- The codebase already uses `font-mono` for code-like text (hash values in CommitDetailsPanel)
- Keeping `text-[length:inherit]` ensures the code text doesn't change size relative to surrounding text

**Alternatives considered**:
- **Hardcoded grey (#e0e0e0 / #333)**: Rejected — breaks in themes with non-standard backgrounds
- **Custom CSS variable**: Rejected — unnecessary when VS Code provides the semantic variable

## R3: Squash Checkbox Wiring

**Decision**: Add `squash` state variable to MergeDialog and pass it through the existing `onConfirm(options)` callback. No backend changes needed.

**Rationale**:
- `MergeOptions` interface in `shared/types.ts` already has `squash?: boolean`
- `buildMergeCommand()` in `gitCommandBuilder.ts` already handles `options.squash`
- `rpcClient.mergeBranch()` already passes `squash` to the backend message payload
- `WebviewProvider.ts` already passes `squash` to `gitBranchService.merge()`
- The entire data flow is already implemented — only the UI checkbox is missing

**Alternatives considered**: None — the implementation path is unambiguous.

## R4: Merge Dialog Label Inline Code Styling

**Decision**: Use inline `<code>` elements with the same styling as commit message inline code (grey background via `--vscode-textCodeBlock-background`, `font-mono`) for the git flag portions of option labels.

**Rationale**:
- Consistent styling between commit message inline code and dialog labels creates visual coherence
- The `<code>` element is semantically correct for command-line flags
- Keeps the implementation DRY — same visual treatment everywhere

**Alternatives considered**:
- **Different styling for dialog vs commit messages**: Rejected — inconsistent UX
- **Just bold text for flags**: Rejected — doesn't match the user's explicit request for inline code style with grey background
