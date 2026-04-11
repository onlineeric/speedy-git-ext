# Contract: RPC messages

This feature adds one new `RequestMessage` and introduces no new `ResponseMessage` types.

## New request: `stashSelected`

```ts
// shared/messages.ts — add to the RequestMessage union
| {
    type: 'stashSelected';
    payload: {
      /**
       * Stash message to apply (FR-031/FR-032).
       * Always a non-empty string — the webview substitutes
       * buildDefaultStashMessage(count, branch) when the user leaves the
       * input blank, so the backend never needs to know the difference.
       */
      message: string;

      /**
       * The exact, deduped set of paths to stash.
       *
       * Webview responsibilities before sending:
       *   - Include BOTH sides of every renamed pair present in the
       *     uncommitted set, even if the user only selected one side
       *     (FR-035). Deduped.
       *   - Include all user-selected untracked paths (if any). The
       *     presence of at least one untracked file MUST flip
       *     `addUntrackedFirst` to true.
       *   - Order is not significant; backend passes them verbatim as
       *     pathspecs after `--`.
       */
      paths: string[];

      /**
       * When true, the backend runs `git add -- <paths>` before
       * `git stash push -m <message> -- <paths>`. When false, the backend
       * runs only `git stash push -m <message> -- <paths>`.
       *
       * The webview sets this to true iff any selected file has
       * `status === 'untracked'` (FR-028a, FR-033).
       */
      addUntrackedFirst: boolean;
    };
  }
```

### Register the type

Also add to the compile-time exhaustiveness map in `shared/messages.ts`:

```ts
const REQUEST_TYPES: Record<RequestMessage['type'], true> = {
  // ... existing entries unchanged ...
  stashSelected: true,
};
```

### Backend handler (`WebviewProvider.ts`)

Add a new case mirroring the existing `stashWithMessage` handler:

```ts
case 'stashSelected': {
  const result = await this.gitStashService.stashSelected(
    message.payload.message,
    message.payload.paths,
    message.payload.addUntrackedFirst,
  );
  if (result.success) {
    this.postMessage({ type: 'success', payload: { message: result.value } });
    await this.sendInitialData(undefined, true);
  } else {
    this.postMessage({ type: 'error', payload: { error: result.error } });
  }
  break;
}
```

### `GitStashService.stashSelected` (new method)

```ts
/**
 * Stash a user-selected subset of uncommitted files. When `addUntrackedFirst`
 * is true, runs `git add -- <paths>` first so untracked files participate in
 * the stash (git stash push with pathspec does not reliably include untracked
 * files via -u, hence the two-step flow).
 *
 * Both steps are run by GitExecutor and each returns a Result<T, GitError>.
 * On `git add` failure, returns that error immediately without attempting the
 * stash. On `git stash push` failure after a successful add, returns a
 * GitError whose message explicitly names both steps and the current state
 * ("`git add` succeeded; `git stash push` failed with <err>. Selected
 * untracked files are now staged."), so the dialog's inline error banner can
 * show actionable information (FR-F03).
 */
async stashSelected(
  message: string,
  paths: string[],
  addUntrackedFirst: boolean,
): Promise<Result<string>>;
```

### Coexistence with the existing `stashWithMessage` RPC

The existing `stashWithMessage` request stays in place and keeps serving:

- the "Stash Everything…" context-menu flow (no paths → stash whole working tree)
- any existing non-picker callers

`stashSelected` is a **strictly additive** new route for the selective-stash
flow from the "Select files for…" dialog; the two RPCs do not replace each
other.

## No changes to `ResponseMessage`

The success path reuses `type: 'success'` and `sendInitialData(undefined, true)`
for refresh. The failure path reuses `type: 'error'`. The webview renders the
error inside the dialog (inline banner) instead of routing it through the
global toast path, but the message shape is unchanged.
