# Quickstart: Badge Lane Color Matching

## What This Feature Does

Changes all ref badges (branch, tag, stash, HEAD, overflow) in the git graph to use the same color as their commit's graph lane/line, instead of fixed categorical colors. This lets users instantly see which graph line a commit belongs to by looking at its badges.

## Key Files

| File | Role |
|------|------|
| `webview-ui/src/utils/colorUtils.ts` | NEW — shared color utilities (getColor, contrast, style) |
| `webview-ui/src/utils/refStyle.ts` | Badge style classes — remove color, keep layout |
| `webview-ui/src/components/CommitRow.tsx` | Resolve lane color, pass to badge components |
| `webview-ui/src/components/RefLabel.tsx` | Accept lane color, apply inline style |
| `webview-ui/src/components/OverflowRefsBadge.tsx` | Accept lane color, apply inline style |
| `webview-ui/src/components/GraphCell.tsx` | Import getColor from shared utility |

## How It Works

1. `CommitRow` looks up `topology.nodes.get(commit.hash).colorIndex`
2. Resolves to hex via `getColor(colorIndex, palette)` (same logic as GraphCell)
3. Passes hex string as `laneColor` prop to RefLabel and OverflowRefsBadge
4. Each badge applies `getLaneColorStyle(hex)` as inline `style` — background = lane color (60% opacity), text = auto-contrasting light/dark
5. Icons and border styles still differentiate ref types

## Build & Test

```bash
pnpm build          # Build extension + webview
pnpm typecheck      # TypeScript type checking
pnpm lint           # ESLint
```

Then use VS Code "Run Extension" launch config to visually verify badge colors match graph lanes.
