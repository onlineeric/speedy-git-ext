---
description: Commit currently staged changes with an auto-generated message.
---

## User Input

```text
$ARGUMENTS
```

If the user provided hints above, incorporate them into the commit message.

## Instructions

1. Run `git diff --cached --stat` and `git diff --cached` to inspect staged changes. If nothing is staged, inform the user and stop. Do NOT stage any additional files or unstaged changes — only commit what is already staged.
2. Run `git log --oneline -5` to learn the repository's commit message style.
3. Analyze the staged diff and draft a commit message that:
   - Follows the conventional commit format used in recent history (e.g., `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`)
   - Summarizes **why** the change was made, not just what changed
   - Is concise (subject line under 72 characters; add a body only if the change is non-trivial)
   - Incorporates any user-provided hints from above
4. Show the proposed commit message to the user and ask for confirmation before committing.
5. Once confirmed, create the commit with `git commit` (no `-a` flag) using the approved message. Never use `git add` or `git commit -a`. Append the co-author trailer:
   `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
