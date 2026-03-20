# Research: Badge Lane Color Matching

## R1: How to pass lane color from graph topology to badge components

**Decision**: CommitRow resolves `colorIndex` → hex color once, then passes the hex color string down to RefLabel, OverflowRefsBadge, and HEAD indicator as a prop.

**Rationale**: CommitRow already receives `topology: GraphTopology` and can look up `topology.nodes.get(commit.hash)` to get `colorIndex`. It also has access to `userSettings.graphColors` via the Zustand store (same store GraphCell uses). Resolving color once in CommitRow avoids duplicating palette lookup logic in every badge component.

**Alternatives considered**:
- Pass `colorIndex` to each badge component and let them resolve independently → rejected because it couples every badge component to the store and duplicates the `getColor()` logic
- Add lane color to `DisplayRef` type → rejected because DisplayRef is a semantic type (ref categorization), not a visual type; mixing concerns violates single responsibility

## R2: How to compute text contrast for readability

**Decision**: Use a simple relative luminance calculation based on the sRGB formula. If luminance > 0.5, use dark text; otherwise use light text. Apply the same opacity pattern currently used by badges (60% background opacity).

**Rationale**: The W3C relative luminance formula (`0.2126*R + 0.7152*G + 0.0722*B` after linearization) is the standard approach. A simplified version (without full gamma correction) is sufficient since the palette colors are all mid-to-high saturation and the threshold doesn't need to be precise. This avoids adding a dependency for color math.

**Alternatives considered**:
- Full WCAG AA/AAA compliance calculation → rejected as over-engineering for a 10-color palette where visual inspection is sufficient
- Use a library like `color` or `chroma-js` → rejected per YAGNI; a ~10 line function handles this

## R3: How to maintain ref type differentiation without categorical colors

**Decision**: Rely on the existing icon system. Each badge already has a distinct icon: `BranchIcon` for branches, `TagIcon` for tags, no icon but distinct label format for stashes. Merged branches have a distinct border. These visual cues are sufficient since the icons are the primary differentiator (users already have them), and the categorical colors were a secondary cue.

**Rationale**: The existing icons are always visible and provide an unambiguous type signal. Adding additional differentiators (text prefixes, border styles per type) would add visual noise. The border on merged branches already distinguishes them from local-only branches.

**Alternatives considered**:
- Add distinct border styles per ref type (solid for branch, dashed for tag, dotted for stash) → rejected as visual noise; icons are clearer
- Add text prefix ("tag:", "stash:") → rejected as redundant with icons and wastes horizontal space

## R4: How to style badges with dynamic hex colors while preserving Tailwind classes

**Decision**: Replace Tailwind background/text color classes with inline `style` attributes for `backgroundColor` and `color`. Keep Tailwind for layout/spacing/border classes (`inline-flex`, `items-center`, `gap-0.5`, `px-1.5`, `py-0.5`, `text-xs`, `rounded`). Merged-branch border color will also use the lane color (with adjusted opacity) instead of the fixed blue.

**Rationale**: Tailwind utility classes can't express arbitrary hex colors from a dynamic palette. Inline styles are the standard React approach for computed colors. Keeping layout classes in Tailwind preserves readability and consistency with the rest of the codebase.

**Alternatives considered**:
- Use CSS custom properties (`--badge-bg`) set per row → viable but adds complexity for no benefit since inline style is simpler
- Use Tailwind arbitrary value syntax (`bg-[#F44336]`) → requires knowing the color at build time; these are runtime values

## R5: Where to extract the shared `getColor` utility

**Decision**: Extract `getColor(colorIndex: number, palette: string[]): string` into a new shared utility file `webview-ui/src/utils/colorUtils.ts`. This file will also contain the luminance/contrast function. Both GraphCell and CommitRow will import from here.

**Rationale**: `getColor` is currently defined inline in GraphCell.tsx. Moving it to a utility allows CommitRow (and any future consumer) to use the same color resolution logic without importing from a component file. Grouping it with the luminance function keeps all color-related utilities together.

**Alternatives considered**:
- Keep `getColor` in GraphCell and import it → rejected because importing utility functions from a component file is an anti-pattern
- Put it in `shared/` → rejected because it's only needed in the webview (frontend); the backend never resolves graph colors

## R6: How OverflowRefsBadge should receive lane color

**Decision**: Add a `laneColor` prop to OverflowRefsBadge. The popover content (hidden refs list) will also use the lane color for its internal RefLabel renders.

**Rationale**: OverflowRefsBadge currently uses hardcoded amber styling. To match the lane color, it needs the resolved hex color passed as a prop. The popover's internal RefLabel renders should also use the lane color for consistency.

**Alternatives considered**:
- Use React context to provide lane color → over-engineering for a simple prop drill of one level
