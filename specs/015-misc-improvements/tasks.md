# Tasks: Miscellaneous Improvements - Branch Filter Dropdown & GitHub Avatar

**Input**: Design documents from `/specs/015-misc-improvements/`
**Prerequisites**: plan.md, spec.md, research.md

**Tests**: Not requested - manual smoke testing via VS Code "Run Extension" launch config.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add shared types needed by multiple user stories

- [x] T001 [P] Add `AvatarUrlMap` type (`Record<string, string>`) and `gitHubAvatarUrls` to shared types in `shared/types.ts`
- [x] T002 [P] Add `avatarUrls` response message type (`{ type: 'avatarUrls'; payload: { urls: Record<string, string> } }`) to `shared/messages.ts`, including a type guard for narrowing the ResponseMessage type (required by Constitution Principle III)

---

## Phase 2: User Story 1 - Centralized Refresh Preserves Branch Filter (Priority: P1) MVP

**Goal**: All actions that refresh the git history graph preserve the current branch filter by storing and re-applying filters through a centralized mechanism in the backend.

**Independent Test**: Set a branch filter, perform pull/push/checkout/rebase/cherry-pick/fetch/refresh/search, verify the filter remains applied after each action.

### Implementation for User Story 1

- [x] T003 [US1] Add `currentFilters: Partial<GraphFilters>` instance field to `WebviewProvider` class in `src/WebviewProvider.ts` — initialize as empty object
- [x] T004 [US1] Update `sendInitialData()` in `src/WebviewProvider.ts` to default to `this.currentFilters` when no explicit filters are passed: change signature to use `filters ?? this.currentFilters`
- [x] T005 [US1] Update `getCommits` handler in `src/WebviewProvider.ts` to store `message.payload.filters` into `this.currentFilters` before calling git service
- [x] T006 [US1] Update `refresh` handler in `src/WebviewProvider.ts` to store `message.payload.filters` into `this.currentFilters` before calling `sendInitialData`
- [x] T007 [US1] Update `fetch` handler in `src/WebviewProvider.ts` to store `message.payload.filters` into `this.currentFilters` before calling `sendInitialData`
- [x] T008 [US1] Add branch existence check in `sendInitialData()` in `src/WebviewProvider.ts` — after fetching branches, if `currentFilters.branch` is set but not found in branch list, clear the branch filter from `currentFilters`

**Checkpoint**: Branch filter should now persist across all actions (pull, push, checkout, rebase, cherry pick, stash ops, revert, fetch, refresh). Verify by setting a branch filter and performing each action.

---

## Phase 3: User Story 2 - Branch Filter Dropdown Visual Improvements (Priority: P2)

**Goal**: Add a dropdown arrow icon to the branch filter trigger button and make the dropdown wider to accommodate longer branch names.

**Independent Test**: Visually inspect the branch filter — arrow icon should appear on right side; long branch names (60+ chars) should be visible without truncation.

### Implementation for User Story 2

- [x] T009 [US2] Add a chevron-down SVG icon to the trigger button in `webview-ui/src/components/FilterableBranchDropdown.tsx` — add inline SVG after the label text, style with `ml-auto flex-shrink-0` to pin to right side
- [x] T010 [US2] Update trigger button classes in `webview-ui/src/components/FilterableBranchDropdown.tsx` — change `max-w-[200px]` to `max-w-[300px]`, add `flex items-center gap-1` for icon alignment
- [x] T011 [US2] Update Popover.Content width in `webview-ui/src/components/FilterableBranchDropdown.tsx` — change `w-[280px]` to `w-[360px]` to accommodate longer branch names

**Checkpoint**: Branch filter dropdown should show arrow icon, and branches up to ~60 characters should be visible without truncation.

---

## Phase 4: User Story 3 - GitHub Avatar Support (Priority: P3)

**Goal**: Fetch commit authors' GitHub avatars from the public API with rate limiting and caching, falling back to Gravatar for non-GitHub repos or when unavailable.

**Independent Test**: Open a GitHub-hosted repository, verify GitHub avatars appear for known authors. Open a non-GitHub repo, verify only Gravatar avatars appear.

### Implementation for User Story 3

- [x] T012 [US3] Create `src/services/GitHubAvatarService.ts` — class with constructor taking repo owner/name, methods: `fetchAvatarUrls(commits: Commit[]): Promise<Result<Record<string, string>, GitError>>` (using the project's Result pattern for error handling), private rate limit state tracking (`remaining: number`, `resetTime: number`), and in-memory cache (`Map<string, { url: string; fetchedAt: number }>`) with 24h TTL. The method MUST deduplicate commits by author email and select one representative commit hash per unique email for the API call, skipping emails already in cache.
- [x] T013 [US3] Implement GitHub remote detection in `src/services/GitHubAvatarService.ts` — add static method `parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null` that parses `github.com` from SSH/HTTPS remote URLs
- [x] T014 [US3] Implement avatar URL fetching in `src/services/GitHubAvatarService.ts` — use Node 18 global `fetch` (purpose-built HTTP API per Constitution Principle IV) to call `/repos/{owner}/{repo}/commits/{hash}`, extract `author.avatar_url`, check `x-ratelimit-remaining` and `x-ratelimit-reset` headers, store `resetTime` from `x-ratelimit-reset`, skip API calls when rate limited (check `Date.now() >= resetTime * 1000` before each request to auto-resume when the limit resets). Requests MUST be sequential (one at a time) with early termination when `x-ratelimit-remaining < 5`. Network errors (timeout, DNS failure, offline) MUST be caught and trigger Gravatar fallback for the affected author.
- [x] T015 [US3] Integrate `GitHubAvatarService` into `WebviewProvider` in `src/WebviewProvider.ts` — instantiate service when remote is GitHub (using `parseGitHubRemote`), after `sendInitialData()` fetches commits, call `fetchAvatarUrls()` for unique emails not yet cached, post `avatarUrls` message to webview. Also update CSP `img-src` directive in `getHtmlForWebview()` to add `https://avatars.githubusercontent.com` (GitHub avatar image domain)
- [x] T016 [US3] Add `gitHubAvatarUrls` state to Zustand store in `webview-ui/src/stores/graphStore.ts` — add `gitHubAvatarUrls: Record<string, string>` state and `setGitHubAvatarUrls(urls: Record<string, string>)` action that merges new URLs into existing map
- [x] T017 [US3] Handle `avatarUrls` message in `webview-ui/src/rpc/rpcClient.ts` — add case for `'avatarUrls'` response type that calls `store.setGitHubAvatarUrls(message.payload.urls)`
- [x] T018 [US3] Update `AuthorAvatar` component in `webview-ui/src/components/AuthorAvatar.tsx` — read `gitHubAvatarUrls` from Zustand store, if a GitHub URL exists for the email use it as primary image source instead of Gravatar URL, keep Gravatar as fallback

**Checkpoint**: GitHub avatars should appear for authors in GitHub-hosted repos. Gravatar should be used for non-GitHub repos and when GitHub API fails or is rate-limited.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and type safety

- [x] T019 Run `pnpm typecheck` and fix any TypeScript errors
- [x] T020 Run `pnpm lint` and fix any ESLint errors
- [x] T021 Run `pnpm build` and verify clean build of both extension and webview
- [ ] T022 Manual smoke test: verify all three user stories work correctly via VS Code "Run Extension" launch config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: No dependency on Phase 1 (different files) - can start in parallel with Phase 1
- **User Story 2 (Phase 3)**: No dependency on Phase 1 or 2 (different files) - can start in parallel
- **User Story 3 (Phase 4)**: Depends on Phase 1 (shared types T001, T002) AND Phase 2 (US1 T003-T008, since T015 also modifies `WebviewProvider.ts`)
- **Polish (Phase 5)**: Depends on all previous phases

### User Story Dependencies

- **User Story 1 (P1)**: Independent - modifies only `src/WebviewProvider.ts`
- **User Story 2 (P2)**: Independent - modifies only `webview-ui/src/components/FilterableBranchDropdown.tsx`
- **User Story 3 (P3)**: Depends on T001+T002 (shared types) AND T003-T008 (US1) completing first due to file conflict (both US1 and US3 modify `src/WebviewProvider.ts`), not functional dependency. Modifies backend service (new), `WebviewProvider.ts`, store, rpcClient, `AuthorAvatar.tsx`

### Within Each User Story

- US1: T003 → T004 → T005+T006+T007 (parallel) → T008
- US2: T009+T010+T011 (all parallel, same file but different sections)
- US3: T012 → T013 → T014 → T015 → T016+T017 (parallel) → T018

### Parallel Opportunities

- T001 and T002 can run in parallel (different files)
- US1 and US2 can run entirely in parallel (no shared files)
- T005, T006, T007 can run in parallel (different switch cases in same file)
- T016 and T017 can run in parallel (different files)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup types (T001-T002)
2. Complete Phase 2: Centralized refresh (T003-T008)
3. **STOP and VALIDATE**: Test branch filter persistence across all actions
4. This alone fixes the most impactful bug

### Incremental Delivery

1. US1: Centralized refresh (bug fix - highest impact)
2. US2: Dropdown visual improvements (quick UI polish)
3. US3: GitHub avatar support (new feature, most complex)
4. Each story adds value without breaking previous stories

---

## Notes

- US1 and US2 are small changes (~20 lines each). US3 is the largest (~200 lines for new service + integrations)
- No new packages needed - uses Node.js built-in `https` for GitHub API calls
- The `sendInitialData()` fix in US1 is the highest-leverage change: one method update fixes the filter for all ~30+ action handlers
