# Contributing to Speedy Git

Thanks for taking the time. Bug reports and PRs are welcome.

## How this project is run

This project follows the Linux model: I'm the benevolent dictator. I welcome contributions
and I'm always happy to talk things through, but the final decision — on what gets merged
and on where the extension goes — is mine.

Disagreement is fine, and I'd rather hear it than not. When we don't converge, I decide,
and I may turn down a change that is perfectly good code simply because it isn't the
direction I want to take. Nothing personal in that.

## What to contribute

**Bug fixes — just open a PR.** No issue needed. In the description, say what was broken
and why your change fixes it. That "why" is the part I read first.

**Features and enhancements — open an issue first.** Describe what you want and why, and
let's agree on the shape before you write code. You can attach a PR as a reference, but I
won't merge a feature that hasn't been discussed — even a well-built one, if it doesn't fit
where the extension is going.

## What I'll decline

- **New runtime dependencies.** Ask first — bundle size and supply chain matter for an extension.
- **Editor integration.** Speedy Git is a graph and history UI. Blame annotations, hovers,
  CodeLens, inline decorations — that's GitLens territory, and I'd rather defer to it.
- **New/update telemetry events.** The telemetry catalogs are allowlist-only and privacy-reviewed.
  I'll add instrumentation myself if a change needs it.
- **Large refactors and reformat-only PRs.** A diff too big to review doesn't get reviewed.

## Setup

Requires Node.js 20.19+, pnpm 10, and VS Code 1.85+.

```bash
git clone https://github.com/<your-fork>/speedy-git-ext.git
cd speedy-git-ext
pnpm install
cd webview-ui && pnpm install && cd ..   # the webview has its own dependencies
pnpm build
```

Press **F5** ("Run Extension") to launch a development host. It opens `../test-repo`, a
sibling folder — run `pnpm generate-test-repo` once to create it.

## Before you open a PR

All three must pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Plus:

- **Test new logic.** Put behavior in a pure function under `utils/` and cover it with
  Vitest, rather than leaving it inline in a component.
- **Colors come from theme tokens only.** Every color must resolve to a `var(--vscode-*)`
  token — use `webview-ui/src/utils/themeColors.ts`. Hardcoded hex values and Tailwind
  palette classes fail the test suite.
- **Update `docs/architecture.md`** when you add, rename, delete, or repurpose a file.
- **Leave `CHANGELOG.md` and the What's New entries alone.** I write those at release time.

Screenshots aren't required, but for anything that changes what the user sees, a before/after
image is the fastest way to get your PR merged.

## PR mechanics

- Fork, branch off **`dev`**, and open the PR against **`dev`**. `main` is the release
  branch; PRs targeting it will be asked to retarget.
- Commit message style is up to you — just be descriptive.
- One PR, one concern.

## Using AI tools

Go ahead — I build this with them too. Two conditions.

**The code is yours.** Read it, run it, and be able to explain why it works. I verify every
PR, and one the author can't explain gets closed.

**Load `CLAUDE.md` and this file at the start of every session** — whatever agent you use,
not just Claude. Agents that look for `AGENTS.md` instead won't find one in a fresh clone;
it's gitignored, so create it yourself as a hard link to `CLAUDE.md`:

```bash
ln CLAUDE.md AGENTS.md                                              # bash / zsh
New-Item -ItemType HardLink -Path AGENTS.md -Target CLAUDE.md       # PowerShell
```

Or skip it and point your agent at `CLAUDE.md` directly — it's the same file either way.

These files carry the conventions this project runs on — theme tokens, telemetry policy,
the webview architecture — and a PR written without them usually breaks several at once.

## What to expect

I maintain this on my own, so reviews can take a while — please be patient. Merged
contributions are credited in the release notes.

By contributing, you agree that your work is licensed under the [MIT License](LICENSE.md).
