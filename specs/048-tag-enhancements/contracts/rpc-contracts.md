# RPC Contracts: Tag Enhancements

The webview↔extension boundary is VS Code message passing. Contracts below are
the typed `RequestMessage`/`ResponseMessage` shapes (in `shared/messages.ts`) and
the handler behavior in `src/webview/handlers/tagHandlers.ts`. Each handler
resolves services from `context.services.current()` at call time (never captures
a service) and posts a `success` or `error` response.

## Request: `createTag` (extended — #2, #4)

**Payload**
```ts
{ name: string; hash: string; message?: string; push?: { remote: string; force?: boolean } }
```

**Handler contract**
1. `createTag(name, hash, message)` → on failure: post `error`, stop.
2. On create success and `push` present:
   `pushTag(name, push.remote, push.force)`.
   - push success → post `success` ("Created and pushed tag '<name>'").
   - push failure → post a message stating the tag was **created locally** but
     the **push failed**, including the push error (FR-010). Not a blanket error,
     not silent success.
3. Always `refreshCoordinator.reload()` after a successful create (the local tag
   must appear regardless of push outcome).
4. When `push` absent → create only, post `success`.

**Preconditions / guards**
- `push` is only ever sent by the webview when ≥1 remote exists (FR-009); backend
  still validates `remote` as a ref name.

## Request: `deleteTag` (extended — #3)

**Payload**
```ts
{ name: string; deleteRemote?: { remote: string } }
```

**Handler contract**
1. `deleteTag(name)` (local `git tag -d`) → on failure: post `error`, stop.
2. On local-delete success and `deleteRemote` present:
   `deleteRemoteTag(deleteRemote.remote, name)`.
   - success → post `success` ("Deleted tag '<name>' locally and on <remote>").
   - **benign no-op**: stderr matches `remote ref does not exist` → treat as
     success; local delete stands (FR-013).
   - genuine failure (auth/network/permission) → post `error` noting the **local
     delete succeeded** but the remote delete failed (FR-013). Do not swallow.
3. `refreshCoordinator.reload()` after successful local delete.
4. When `deleteRemote` absent → local delete only.

## Request: `pushTag` (extended — #4)

**Payload**
```ts
{ name: string; remote?: string; force?: boolean }
```

**Handler contract**
- `pushTag(name, remote, force)`; `force` appends `--force`.
- success → post `success`; failure → post `error` (a non-forced push rejected by
  a diverged remote tag surfaces here, FR-016 negative case).

## Response: `tagMetadata` (new — #1)

**Payload**
```ts
{ metadata: Record<string, TagMetadata> }
```

**Producer**: `RepoDataLoader.sendDeferredRepoData(generation)` reads
`getTagMetadata()`, converts the `TagMetadata[]` to a name-keyed record, and posts
this message — generation-guarded (drop if `generation !== runtime.fetchGeneration`)
exactly like the other deferred posts.

**Consumer**: `rpcClient.ts` response switch adds a `tagMetadata` case calling
`store.setTagMetadata(payload.metadata)` (whole-map replace ⇒ refresh invalidates).

## Service contracts (`GitTagService`)

| Method | Args (git) | Result | Notes |
|--------|-----------|--------|-------|
| `pushTag(name, remote?, force?)` | `push <remote\|origin> [--force] refs/tags/<name>` | `Result<string>` | 60 s timeout; validates name + remote. |
| `deleteRemoteTag(remote, name)` | `push <remote> --delete <name>` | `Result<string>` | 60 s timeout; `remote ref does not exist` → `ok(...)`. |
| `getTagMetadata()` | `for-each-ref --format=<…%00…> refs/tags` | `Result<TagMetadata[]>` | parsed by `parseTagMetadata`; no network. |

All preserve the `Result<T, GitError>` pattern (Constitution III); none throw.

## Validation contracts

- Tag/remote names continue through `validateRefName` (flag-injection guard) —
  existing behavior, covered by `GitTagService.test.ts`.
- New flags (`force`, `deleteRemote`, `push`) are plain booleans/objects; no extra
  validation beyond the existing name checks.

## Backward compatibility

All three request payload changes are **additive optional fields** — omitting
`push`/`deleteRemote`/`force` reproduces today's behavior, so any in-flight or
older caller path stays valid. `tagMetadata` is a new response type added to the
exhaustive switch (compile-time enforced).
