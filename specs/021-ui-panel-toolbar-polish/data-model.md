# Data Model: UI Panel & Toolbar Polish

**Branch**: `021-ui-panel-toolbar-polish` | **Date**: 2026-03-24

## Summary

No new data entities are introduced by this feature. All changes are UI-only modifications to existing React components and Zustand store actions. No shared types or message contracts need to change.

## State Changes

### graphStore.ts — `setActiveRepo` Action

The existing `setActiveRepo` action will be modified to clear additional state fields:

**Current state cleared**: `isLoadingRepo: true`, `pendingCommitCheckout: null`

**Additional state to clear on repo switch**:
- `selectedCommit: undefined`
- `selectedCommitIndex: -1`
- `selectedCommits: []`
- `lastClickedHash: undefined`
- `commitDetails: undefined`
- `detailsPanelOpen: false`

No new state properties are added. No state shape changes.
