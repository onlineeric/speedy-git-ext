# Data Model: Badge Lane Color Matching

## Existing Entities (no changes)

### CommitNode
- `hash: string` — commit hash
- `lane: number` — assigned graph lane (x-position)
- `colorIndex: number` — index into color palette (source of truth for badge coloring)
- `parentConnections: { parentHash, fromLane, toLane, colorIndex }[]`
- `incomingConnections: { fromLane, colorIndex }[]`
- `hasConnectionFromAbove: boolean`

### GraphTopology
- `nodes: Map<string, CommitNode>` — hash → node lookup
- `maxLanes: number`
- `passingLanesByRow: Map<number, { lane, colorIndex }[]>`
- `commitIndexByHash: Map<string, number>`

### DisplayRef (discriminated union)
- `{ type: 'local-branch'; localName: string }`
- `{ type: 'remote-branch'; remoteName: string }`
- `{ type: 'merged-branch'; localName: string; remoteNames: string[] }`
- `{ type: 'tag'; tagName: string }`
- `{ type: 'stash'; stashRef: string }`

### UserSettings
- `graphColors: string[]` — hex color palette (dynamic, user-configurable)

## New Entities

### None

No new data entities are needed. The existing `CommitNode.colorIndex` + `UserSettings.graphColors` palette provide all the data required to derive badge colors at render time.

## Data Flow Changes

### Current Flow
```
CommitRow → mergeRefs() → DisplayRef[] → RefLabel
                                           ↓
                                     getRefStyle(type) → Tailwind classes (fixed colors)
```

### New Flow
```
CommitRow → topology.nodes.get(hash) → colorIndex
          → getColor(colorIndex, palette) → hex color
          → mergeRefs() → DisplayRef[] → RefLabel(displayRef, laneColor)
                                            ↓
                                      getRefStyle(type) → Tailwind layout classes
                                      + inline style { backgroundColor, color } from laneColor
```

## Color Resolution

```
colorIndex: number
    ↓
palette = userSettings.graphColors.length > 0 ? graphColors : ['#4ec9b0']
    ↓
hex = palette[colorIndex % palette.length]
    ↓
luminance = 0.2126*R + 0.7152*G + 0.0722*B  (after linearization)
    ↓
textColor = luminance > 0.5 ? '#1a1a1a' : '#f5f5f5'
```
