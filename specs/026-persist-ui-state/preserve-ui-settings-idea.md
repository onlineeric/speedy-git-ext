Implement persistent UI state for the commit details panel.

Goal:
Preserve the user's last-used commit details UI state across panel close/reopen, VS Code reload, and extension updates.

Important architecture requirement:
Do not replace Zustand. Keep Zustand as the live webview state store.
Use `this.context.globalState` in the extension host as persistent storage.
Hydrate Zustand from persisted state on webview startup, and write updates back to `this.context.globalState` whenever the user changes these UI settings.

Persist these values:
- commit details panel position: `bottom` or `right`
- commit details file change view mode: `list` or `tree`
- commit details panel size:
  - height when panel is on the bottom
  - width when panel is on the right

Expected behavior:
- When the panel is closed and reopened, restore the last saved UI state.
- When extension is closed and reopened, restore the last saved UI state.
- When VS Code reloads or the extension updates, restore the last saved UI state.
- If no saved state exists, fall back to the current defaults, and create a new saved state.
- Persist only UI preferences/state that make sense to restore; do not remove existing Zustand usage.

Implementation guidance:
- Add a small persisted UI state model/type, centralize reusable code, allow future expansion.
- Read persisted state from `this.context.globalState` in the extension host.
- Send that state to the webview during initialization.
- Initialize or hydrate the Zustand store from that persisted state.
- When the user changes panel position, file view mode, or panel size, update Zustand immediately and also persist the new value back through the extension host into `this.context.globalState`.
- Validate persisted values and safely fall back to defaults if the stored shape is missing or invalid.
- Add a version field to the persisted state if helpful for future migrations.

Files likely involved:
- `src/WebviewProvider.ts`
- `webview-ui/src/stores/graphStore.ts`
- `webview-ui/src/rpc/rpcClient.ts`
- `webview-ui/src/components/CommitDetailsPanel.tsx`
- `shared/messages.ts`
- `shared/types.ts` if a shared persisted UI state type is useful

Acceptance criteria:
- Position, view mode, and size are restored after closing and reopening the panel.
- Position, view mode, and size are restored after reloading VS Code / restarting the extension host.
- status icons are still displayed correctly - view type icons, Move right / Move bottom icons.
- State still works correctly with Zustand during normal interaction.
- Existing behavior is preserved aside from the new persistence.
- TypeScript, lint, and build pass.