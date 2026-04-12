---
description: Do plan, tasks, analysis, fix issues and implement one by one.
---

## User Input

```text
$ARGUMENTS
```

Consider any user-provided hints before proceeding.

---

## Execution Steps

Create a task list with the steps below using `TaskCreate`, then complete them one by one in order. Mark each task as completed before moving to the next.

- [ ] 1. Run `/speckit.plan` to plan the feature
- [ ] 2. Run `/speckit.claude-cleanup` to clean up the CLAUDE.md file.
- [ ] 3. Run `/speckit.tasks` to generate the tasks
- [ ] 4. Run `/speckit.analyze` to analyze the tasks
- [ ] 5. Auto-fix all issues found in the analysis using your best judgement. Do NOT ask the user for confirmation — apply all fixes automatically.
- [ ] 6. Spawn a sub-agent (foreground, awaited) to run `/speckit.implement`. Wait for it to complete before marking this task done. The sub-agent starts with a fresh context so the full context budget is available for implementation. All needed context (tasks.md, plan.md, data-model.md, research.md, quickstart.md) is on disk — pass the spec directory path so it knows where to look.
