# Follow-up: VS Code Theme Color Compliance Audit

**Status:** open — logged 2026-08-08, not yet scheduled
**Scope:** `webview-ui/src/**`
**Origin:** Found while building the 5.9.0 avatar feature. The "Clear all cached avatars" and
"Reset column widths" buttons rendered as plain labels because they had no background at all. Fixing
that surfaced a broader pattern: the webview mixes VS Code theme tokens with hardcoded Tailwind
palette colors.

## The rule (now in CLAUDE.md)

Every color in the webview must come from a `var(--vscode-*)` theme token. The webview renders
inside the user's editor and VS Code redefines these tokens per theme. A hardcoded color stays fixed
while everything around it changes — so it looks right in whichever theme it was written against and
wrong in every other one. The `-300`/`-400` Tailwind shades used throughout were picked against a
dark theme and wash out on light themes.

Using a hex as a **fallback** inside a token reference is correct and encouraged:

```ts
// Good — theme wins, hex only if the token is undefined
const VERIFIED_COLOR = 'var(--vscode-testing-iconPassed, #4CAF50)';
```

## Already fixed (5.9.0, no action needed)

- `components/dialogStyles.ts` now exports `buttonPrimaryClassName` / `buttonSecondaryClassName`.
- `AvatarSettingsSection.tsx` and `CommitListSettingsPopover.tsx` use them for all five buttons.

---

## Group 1 — Hardcoded palette colors (the real problem)

Highest user impact: these are colored text and badges that become hard to read on light themes.

### 1a. File status colors — biggest single win

`components/FileChangeShared.tsx` — 22 instances across lines 22–241
(`text-green-400/300`, `text-red-400/300`, `text-yellow-400/300`, `text-blue-400`,
`text-purple-400`, `text-gray-400`, and `bg-*-900/40` chip backgrounds)

`components/CommitDetailsPanel.tsx` — lines 292, 293, 625, 627, 811, 813
(`text-green-400` / `text-red-400` for insertion/deletion counts)

Suggested tokens — VS Code has purpose-built ones that already match the user's SCM colors:

| Meaning | Token |
| --- | --- |
| Added | `--vscode-gitDecoration-addedResourceForeground` |
| Modified | `--vscode-gitDecoration-modifiedResourceForeground` |
| Deleted | `--vscode-gitDecoration-deletedResourceForeground` |
| Renamed | `--vscode-gitDecoration-renamedResourceForeground` |
| Untracked | `--vscode-gitDecoration-untrackedResourceForeground` |
| Ignored / neutral | `--vscode-gitDecoration-ignoredResourceForeground` |

The `bg-*-900/40` chip backgrounds have no direct token equivalent. Either drop the background and
keep colored text only, or derive it with `color-mix(in srgb, var(--token) 20%, transparent)`.

### 1b. Warning / error surfaces

| File | Line | Current | Suggested |
| --- | --- | --- | --- |
| `PushDialog.tsx` | 139 | `text-yellow-300`, `border-yellow-500`, `bg-yellow-500/10` | `--vscode-editorWarning-foreground`, `--vscode-inputValidation-warningBorder`, `--vscode-inputValidation-warningBackground` |
| `PushDialog.tsx` | 166 | `bg-yellow-600`, `bg-yellow-700` | destructive button — consider `--vscode-inputValidation-errorBorder` or keep primary tokens |
| `WorktreeWidget.tsx` | 126 | `text-yellow-400`, `bg-yellow-400/10` | `--vscode-editorWarning-foreground` |
| `CompareWidget.tsx` | 299 | `text-red-400` | `--vscode-errorForeground` |
| `ControlBar.tsx` | 42, 43 | `text-yellow-400` | `--vscode-editorWarning-foreground` |
| `HelpDialog.tsx` | 63 | `text-green-400` | `--vscode-textLink-foreground` or `--vscode-charts-green` |

### 1c. Accent / active state

| File | Line | Current | Note |
| --- | --- | --- | --- |
| `ControlBar.tsx` | 41 | `text-sky-400` | active toolbar button |
| `CommitListSettingsPopover.tsx` | 118 | `text-sky-400` | same pattern — **change these two together** |
| `OverflowRefsBadge.tsx` | 25 | `text-amber-400/300`, `border-amber-500/400` | the `+N` overflow badge |
| `CommitTableRow.tsx` | 41, 42 | `bg-sky-500`, `bg-emerald-500` + `text-white` | Compare B/T badges; `text-white` is also hardcoded |

Suggested for active state: `--vscode-inputOption-activeForeground`, `--vscode-textLink-activeForeground`,
or `--vscode-focusBorder`. For the B/T badges, `--vscode-charts-blue` / `--vscode-charts-green` with
`--vscode-editor-background` as the text color.

---

## Group 2 — Raw hex outside token fallbacks

Much smaller than it first appeared. Several files initially flagged are **correct** and need no work
(see "Legitimate" below).

| File | Line | Value | Note |
| --- | --- | --- | --- |
| `utils/worktreeBadgeStyle.ts` | 1, 2 | `#facc15`, `#ef4444` | worktree badge borders; needs a token or a documented fallback |
| `components/GraphCell.tsx` | 47 | `#888` | uncommitted node fill — `--vscode-descriptionForeground` |
| `components/GraphCell.tsx` | 58 | `#E8A317` | uncommitted lane accent, deliberately distinct from lane colors |
| `components/CommitTableRow.tsx` | — | `#E8A317` | same constant duplicated; extract if touched |
| `components/CommitTooltip.tsx` | 68 | `rgba(0,0,0,0.35)` | drop-shadow; arguably fine as a shadow, low priority |

These live in `.ts`/SVG-attribute positions rather than classNames, so they need a small helper to
read a CSS variable at runtime — more work per instance than Group 1.

---

## Group 3 — Duplication only (no visual bug)

About 30 components hand-roll the button class strings. They already use the correct tokens, so
nothing renders wrong; this is purely DRY. Two files define their own local constants that now
duplicate the shared ones:

- `components/RemoteManagementDialog.tsx:21,24` — `buttonPrimaryClass` / `buttonSecondaryClass`
- `components/InteractiveRebaseDialog.tsx:34,35` — `buttonPrimary` / `buttonSecondary`

Both should import from `components/dialogStyles.ts` and delete the locals. Mechanical, low risk,
good filler work.

---

## Legitimate — do not "fix"

- **`utils/signatureGlyph.ts:19-21`** — already `var(--vscode-testing-iconPassed, #4CAF50)` etc. This
  is the correct pattern; the hex is only a fallback.
- **`utils/colorUtils.ts:2`** — `DEFAULT_GRAPH_PALETTE`; graph lane colors are user-configurable via
  `speedyGit.graphColors`.
- **`utils/colorUtils.ts:56`** — `#1a1a1a` / `#f5f5f5` chosen by luminance to sit readably on an
  arbitrary user-chosen lane color. Deriving from a theme token would defeat the contrast math.
- **`utils/gravatar.ts`** — `hsl(...)` generated per email for the initials fallback background.
- **`bg-black/50` dialog overlays** (22 dialogs) — a modal scrim is meant to be theme-independent.

---

## Suggested sequencing

1. **Group 1a** — `FileChangeShared.tsx` + `CommitDetailsPanel.tsx`. Half of all instances, and the
   most-seen surface in the app (the details panel). Best value per edit.
2. **Group 3** — mechanical import swap, zero visual risk.
3. **Group 1b/1c** — warning/error/accent surfaces.
4. **Group 2** — needs a CSS-var reader helper first; lowest value.

## Verification

```bash
# Tailwind palette colors in the webview
cd webview-ui/src && grep -rnoE "(text|bg|border|fill|stroke|ring|decoration|outline|accent|shadow|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}(/[0-9]+)?" --include=*.tsx --include=*.ts .

# Raw hex / rgb outside a var() fallback
grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" --include=*.tsx --include=*.ts . | grep -v "var(--vscode"
```

Manual check: switch to a **light** theme (e.g. Light Modern) and a **high-contrast** theme, then
review the commit details panel, push dialog, worktree widget and overflow badges. Automated checks
cannot catch "technically a token, but the wrong one".
