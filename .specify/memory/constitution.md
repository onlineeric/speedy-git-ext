<!--
SYNC IMPACT REPORT
==================
Version change: [template] → 1.0.0 (initial adoption)

Modified principles: N/A — first fill of template placeholders

Added sections:
  - Core Principles (I–V)
  - Technology Stack Constraints
  - Development Workflow & Agent Restrictions
  - Governance

Removed sections: N/A

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no changes needed; "Constitution Check" gate references constitution generically
  - .specify/templates/spec-template.md ✅ no changes needed; spec structure is compatible
  - .specify/templates/tasks-template.md ✅ no changes needed; task categories align with principles
  - CLAUDE.md ✅ serves as runtime agent guidance; referenced in Governance below

Follow-up TODOs:
  - None: all placeholders resolved; ratification date set to initial-adoption date (2026-03-16)
-->

# Speedy Git Extension Constitution

## Core Principles

### I. Performance First (NON-NEGOTIABLE)

Every architectural and implementation decision MUST prioritize speed and responsiveness,
especially for large repositories (500+ commits, many branches).

- Virtual scrolling MUST be used for any list rendering more than a few dozen rows.
- Graph topology computation MUST remain in the webview (frontend) to keep the
  extension host responsive.
- Git processes MUST have a hard timeout (30 s) enforced via `GitExecutor`.
- Batch prefetch and O(1) lookup pre-computation (e.g., passing-lanes map) are required
  for graph rendering.
- Perceived latency MUST be minimized: show cached data first, update incrementally.

**Rationale**: This is a developer tool used on large, active repos. A sluggish UI is
a broken UI. Performance is a feature, not a nice-to-have.

### II. Clean Code & Simplicity

Code MUST be clean, readable, and self-documenting. Clever or cryptic solutions are
prohibited.

- Follow single responsibility principle: classes, functions, and files MUST stay
  small and focused.
- DRY: reusable logic MUST be extracted into shared functions, components, or libraries.
- Prefer explicit over implicit; avoid magic values, side-effect-heavy code, or
  implicit coupling.
- YAGNI: do not add features, abstractions, or error handling for hypothetical
  future requirements.
- Only add comments where the logic is not self-evident from the code itself.

**Rationale**: This codebase spans backend (Node.js) and frontend (React). Clarity
prevents cross-boundary bugs and keeps onboarding cost low.

### III. Type Safety & Explicit Error Handling

TypeScript strict mode with `noUnusedLocals`, `noUnusedParameters`, and
`noImplicitReturns` is NON-NEGOTIABLE.

- All git operations MUST return `Result<T, GitError>` instead of throwing exceptions.
- Types in `shared/types.ts` and `shared/messages.ts` MUST be kept as the single
  source of truth for cross-boundary contracts.
- Type guards MUST be used when narrowing `RequestMessage` / `ResponseMessage` types.
- Any new shared entity MUST be added to `shared/types.ts` before use in either layer.

**Rationale**: The webview↔extension boundary is untyped at runtime (message passing).
Strong compile-time guarantees and the `Result` monad prevent silent failures that
are hard to reproduce in a VS Code host environment.

### IV. Library-First & Purpose-Built Tools

Battle-tested, well-maintained libraries MUST be preferred over manual implementations.

- Parsing structured data (HTML, JSON, XML, git output) MUST use purpose-built libraries,
  not regex.
- New packages MUST have: active maintenance, TypeScript support, and a readable API.
- Agents MUST NOT auto-install packages; they MUST provide the install command for the
  developer to run manually.

**Rationale**: Manual parsers drift, break on edge cases, and obscure intent. Libraries
encode community knowledge and are independently tested.

### V. Dual-Process Architecture Integrity

The extension host (backend) and the webview (frontend) MUST remain cleanly separated.
Cross-boundary communication MUST use only VS Code's message-passing API.

- Backend (`src/`) handles all git I/O via `GitExecutor` and related services.
- Frontend (`webview-ui/src/`) handles all rendering, virtual scrolling, and graph
  topology computation.
- `shared/` is the ONLY location for types and message contracts used by both sides.
- Direct DOM manipulation, `require('vscode')`, or git subprocess spawning MUST NOT
  appear in webview code.

**Rationale**: VS Code runs the webview in a sandboxed browser context. Mixing
concerns causes untestable coupling and breaks the security model.

## Technology Stack Constraints

The following technology choices are fixed and MUST NOT be changed without a
constitution amendment:

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.x (strict) |
| Extension host build | esbuild → CommonJS, node18, externalizes `vscode` |
| Webview build | Vite + React plugin → ESM |
| UI framework | React 18 |
| State management | Zustand |
| UI primitives | `@radix-ui/react-context-menu`, `@radix-ui/react-alert-dialog` |
| Virtual scrolling | `@tanstack/react-virtual` |
| Runtime host | VS Code Extension API (1.80+) |
| Package manager | pnpm |

Path alias `@shared/*` → `shared/*` MUST be maintained in both `webview tsconfig`
and `vite.config`.

## Development Workflow & Agent Restrictions

### Build & Validation Gates

Before any feature is considered complete, the following MUST pass:

1. `pnpm typecheck` — zero TypeScript errors.
2. `pnpm lint` — zero ESLint errors.
3. `pnpm build` — clean build of both extension and webview.
4. Manual smoke test via VS Code "Run Extension" launch config.

### Agent Restrictions (NON-NEGOTIABLE)

- Agents MUST NOT commit, branch, merge, or push. Only readonly git operations
  (`git log`, `git status`, `git diff`) are permitted. PRs may be created only when
  explicitly requested by the developer.
- Agents MUST NOT install packages. They MUST output the install command for the
  developer to run.

### Feature Development Sequence

1. Spec → `/speckit.specify`
2. Plan → `/speckit.plan`
3. Tasks → `/speckit.tasks`
4. Implement → `/speckit.implement`
5. Validate → typecheck + lint + build + smoke test

## Governance

This constitution supersedes all other stated practices. When CLAUDE.md and this
constitution conflict, this constitution takes precedence on principles; CLAUDE.md
governs runtime agent behavior (build commands, file locations, etc.).

**Amendment procedure**:

1. Propose amendment with: rationale, principle affected, and migration plan.
2. Developer approval required before amendment takes effect.
3. Increment `CONSTITUTION_VERSION` per semantic versioning:
   - MAJOR: principle removal or incompatible redefinition.
   - MINOR: new principle or materially expanded guidance.
   - PATCH: clarifications, wording, typo fixes.
4. Update `LAST_AMENDED_DATE` to the amendment date (ISO 8601).
5. Run consistency propagation: verify all templates in `.specify/templates/` still
   align with updated principles.

**Compliance**: All PRs MUST be reviewed against Core Principles I–V. Violations MUST
be justified in the PR description under a "Constitution Check" section.

**Runtime agent guidance**: See `CLAUDE.md` for build commands, file layout, and
current active technologies.

**Version**: 1.0.0 | **Ratified**: 2026-03-16 | **Last Amended**: 2026-03-16
