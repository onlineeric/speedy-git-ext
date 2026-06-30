# Phase 1 Data Model: Tag Enhancements

The single source of truth for cross-boundary types is `shared/types.ts` and
`shared/messages.ts` (Constitution III). This feature adds one entity and extends
three message payloads plus one new response message.

## New entity: `TagMetadata`

Added to `shared/types.ts`. Read once per load from `git for-each-ref refs/tags`
and cached in the webview store keyed by `name`.

```ts
export interface TagMetadata {
  /** Short tag name (e.g. "v1.0.0"); the key used for lookup. */
  name: string;
  /** true when the tag is an annotated/object tag; false for a lightweight tag. */
  annotated: boolean;
  /** Annotation message (subject + optional body). Present only when annotated. */
  message?: string;
  /** Tagger display name. Present only when annotated. */
  tagger?: string;
  /** Tag date as unix seconds. Present only when annotated. */
  date?: number;
}
```

| Field | Type | Source atom (`for-each-ref`) | Notes |
|-------|------|------------------------------|-------|
| `name` | `string` | `%(refname:short)` | Always present; lookup key. |
| `annotated` | `boolean` | `%(objecttype)` (`tag` → true) | Drives tooltip branch (FR-003). |
| `message` | `string?` | `%(contents:subject)` + `%(contents:body)` | Omitted when lightweight. |
| `tagger` | `string?` | `%(taggername)` | Omitted when lightweight/empty. |
| `date` | `number?` | `%(taggerdate:unix)` | Omitted when lightweight; formatted via existing `formatDate`. |

**Validation / parsing rules** (`parseTagMetadata` in `src/utils/gitParsers.ts`):
- Split output by record (`\n`), then by field (`%00`).
- `annotated = objecttype === 'tag'`.
- When not annotated, drop `message`/`tagger`/`date` (do not carry empty strings).
- Trim a trailing empty `message` to `undefined`.
- Skip blank trailing records.

**Lifecycle**: transient. Loaded with deferred data, replaced wholesale on each
load; never persisted (FR-004 invalidate-on-refresh).

## Store state (webview, `graphStore.ts`)

Mirrors existing cached maps (`gitHubAvatarUrls`, `worktreeByHead`).

```ts
// state
tagMetadata: Record<string, TagMetadata>;   // keyed by tag name

// action
setTagMetadata: (metadata: Record<string, TagMetadata>) => void;  // whole-map replace
```

The `tagMetadata` response message handler calls `setTagMetadata`, replacing the
prior map (refresh invalidation). Tag-badge renderers read `tagMetadata[name]`.

## Message contract changes (`shared/messages.ts`)

### Request payload extensions

```ts
// BEFORE
| { type: 'createTag'; payload: { name: string; hash: string; message?: string } }
| { type: 'deleteTag'; payload: { name: string } }
| { type: 'pushTag';   payload: { name: string; remote?: string } }

// AFTER
| { type: 'createTag'; payload: {
      name: string; hash: string; message?: string;
      push?: { remote: string; force?: boolean };   // present ⇒ chain push after create (#2, #4)
  } }
| { type: 'deleteTag'; payload: {
      name: string;
      deleteRemote?: { remote: string };            // present ⇒ also delete from remote (#3)
  } }
| { type: 'pushTag';   payload: {
      name: string; remote?: string; force?: boolean; // #4
  } }
```

Notes:
- Modeling create's push as a nested `push?` object (rather than two booleans)
  keeps "push requested" and "force" coupled and mirrors `deleteBranch`'s
  `deleteRemote?: { remote; name }` shape.
- `deleteRemote` carries only `{ remote }` — the tag name is already top-level.

### New response message (deferred metadata)

```ts
| { type: 'tagMetadata'; payload: { metadata: Record<string, TagMetadata> } }
```

Posted from `RepoDataLoader.sendDeferredRepoData` (generation-guarded like the
other deferred posts). The exhaustive response-handler switch in `rpcClient.ts`
gains a `tagMetadata` case calling `setTagMetadata`.

The request-type allow-list near `shared/messages.ts:208`
(`createTag: true, deleteTag: true, pushTag: true`) is unchanged — no new request
type is added (metadata rides deferred data, not an explicit request). If a
discrete `getTagMetadata` request is preferred during implementation, it would be
added there with a handler in `tagHandlers.ts`; the deferred-push path is the
default per research.

## Backend service surface (`GitTagService`)

```ts
// CHANGED
pushTag(name: string, remote?: string, force?: boolean): Promise<Result<string>>;
//   args: ['push', remote ?? 'origin', ...(force ? ['--force'] : []), `refs/tags/${name}`]

// NEW
deleteRemoteTag(remote: string, name: string): Promise<Result<string>>;
//   args: ['push', remote, '--delete', name]   (60 s timeout)
//   benign no-op: stderr includes 'remote ref does not exist' ⇒ ok(...)

getTagMetadata(): Promise<Result<TagMetadata[]>>;
//   args: ['for-each-ref', '--format=<null-byte format>', 'refs/tags']
//   parsed by parseTagMetadata()
```

`createTag` and the local `deleteTag` are unchanged at the service level; the
**create+push** and **local+remote delete** chaining lives in `tagHandlers.ts`.

## Command-preview builders (`gitCommandBuilder.ts`)

- `buildTagCommand` — extend to optionally append the chained push line when
  "Also push" is on, reflecting `--force` when set.
- `buildDeleteTagCommand` — keep local form; add a remote-delete form
  (`git push <remote> --delete <name>`) shown when "Also delete from remote" is on
  (analogous to `buildDeleteBranchWithRemoteCommand`).
- Push-tag preview — `git push <remote> [--force] refs/tags/<name>`.

## Entity relationships

```text
Commit.refs[] ── RefInfo{ type:'tag', name } ──┐
                                               ├─ name ─► TagMetadata (cached map)
git for-each-ref refs/tags ─► TagMetadata[] ───┘
TagMetadata ─► tag badge native title tooltip (RefLabel)
```

`RefInfo` (the badge source) is unchanged; `TagMetadata` is a parallel,
name-keyed enrichment layer so the existing `%D`-driven badge rendering is
untouched.
