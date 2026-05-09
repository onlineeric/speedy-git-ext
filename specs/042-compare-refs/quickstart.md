# Quickstart: Compare Refs (A vs B)

**Feature**: `042-compare-refs`
**Audience**: developer running the manual smoke test after `pnpm build` + `Run Extension`.

This quickstart is intentionally a step-by-step manual verification of every acceptance scenario
in the spec. It exists because a VS Code extension's webview UI is not unit-testable end-to-end;
this is the script for the validation gate before merge.

**Prerequisites**:

```bash
pnpm build                   # build extension + webview
pnpm generate-test-repo      # generate test-repo/ if not already present
# In VS Code: F5 → "Run Extension"
```

Open the test repo (or any local repo with ≥2 commits and at least one feature branch).

---

## Scenario 1 — Right-click compare two visible commits (Story 1, P1)

1. Open the Speedy Git graph.
2. Right-click any commit X. Verify the menu shows **Set as Base** (and only Set as Base — no
   "Compare with Base" yet because A is unset). [AC1#4]
3. Click **Set as Base**.
4. Right-click X again. Verify **Compare with Base** is *disabled* (cannot compare with itself).
   [AC1#2]
5. Right-click a different commit Y. Verify **Compare with Base** is enabled and **Set as Base**
   is also still present. [AC1#3]
6. Click **Compare with Base**.
7. Verify the Commit Details panel shows: a header naming both ends, a file list, and the
   correct files for `git diff X Y` (or `X..Y`). [AC1#1]
8. Open any file in the list — verify VS Code opens a diff editor showing the X→Y diff.
9. Click any single commit in the graph. Verify the panel returns to single-commit details and
   the compare result is gone. [AC1#5]

---

## Scenario 2 — Panel-driven branch-vs-branch comparison (Story 2, P2)

1. Click the **Compare** toolbar icon to open the panel.
2. Verify both slots are empty and the Compare button is disabled. [AC2#1]
3. Type `main` in slot A. Pick the branch from the dropdown.
4. Type `main` in slot B too. Verify the Compare button is disabled with an inline
   "A and B are the same" hint. [AC2#2]
5. Change slot B to `feature/x` (or any other branch).
6. Verify the mode toggle defaulted to **3-dot** (both slots are branches). [AC5#1]
7. Click **Compare**. Verify the result renders and matches `git diff main...feature/x` from
   the terminal. [AC2#3]
8. Click the **⇄** swap button. Verify slot values exchange and the showing result is dismissed
   (panel cleared). [AC2#4]
9. Click the ✕ on slot A. Verify slot A becomes empty and Compare is disabled. [AC2#5]
10. Type `not-a-branch` into slot A and `main` into slot B. Click **Compare**. Verify an inline
    "Unknown ref" error shows and no result is rendered. [AC2#8]
11. Fix slot A back to `main`. Open the panel toggle off (close the panel). Verify the toolbar
    Compare icon is now **light yellow** (pending). [AC2#6 + FR-002]
12. Reopen the panel. Verify slots A and B still hold their values. [AC2#6]
13. Reload the VS Code window (`Developer: Reload Window`). Reopen Speedy Git. Verify slots A
    and B are empty again. [AC2#7]

---

## Scenario 3 — Working-tree comparison (Story 3, P3)

1. Make a local file edit in the test repo (uncommitted).
2. Open the Compare panel.
3. In slot A pick `HEAD`, in slot B pick **Working Tree**.
4. Verify the **3-dot** option is disabled with an explanatory tooltip. [AC3#2 + FR-011]
5. Click **Compare**.
6. Verify the result lists exactly your edited files with correct diffs. [AC3#1]
7. Edit another file on disk. Wait for auto-refresh (or trigger it).
8. Verify the compare result updated to include the new edit. [AC3#3 + FR-032]
9. Discard your local edits (`git checkout -- .`). Click Compare again.
10. Verify the result shows "No changes" with empty file list — not an error. [AC3#4 + FR-024]

---

## Scenario 4 — Range compare via multi-selection (Story 4, P3)

1. In the graph, Ctrl/Cmd+click two or more commits (a contiguous range).
2. Right-click. Verify **Compare these commits** is offered. [AC4 entry point]
3. Click it.
4. Verify the panel slots show A = `<oldest>^` (parent of oldest) and B = `<newest>`, and the
   comparison runs immediately. [AC4#1 + FR-019]
5. Verify the result matches `git diff <oldest>^ <newest>`.
6. Now select exactly 1 commit. Right-click. Verify **Compare these commits** is hidden.
   [AC4#2]
7. Multi-select including a non-contiguous gap (Ctrl-click commits with rows in between).
   Right-click → Compare these commits. Verify the system collapsed to oldest+newest and
   the slots display that endpoint pair. [AC4#3]
8. Multi-select including the very first (root) commit + one other. Right-click → Compare these
   commits. Verify slot A is the empty-tree sentinel (UI shows "Empty Tree" or similar) and the
   diff shows the full content of B. [AC4#4 + FR-016]

---

## Scenario 5 — Two-dot vs three-dot defaults (Story 5, P3)

1. Open Compare panel. Pick branch `main` for A and branch `feature/x` for B.
2. Verify mode defaulted to **3-dot**. [AC5#1]
3. Click Compare. Verify result matches `git diff main...feature/x`.
4. Flip toggle to **2-dot**. Verify the showing result is dismissed (FR-020 — input change).
5. Click Compare. Verify result matches `git diff main feature/x`. [AC5 independent test]
6. Now change slot A to a typed expression `HEAD~3` (type and press Enter). Verify the toggle
   default snapped to **2-dot** (because at least one side is a typed expression). [AC5#2]
7. Pick **Working Tree** for slot B. Verify 3-dot is disabled with tooltip. [AC5#3 + FR-011]
8. Compare two branches that share **no** common ancestor (set up by `git checkout --orphan`
   in the test repo, or use any two branches across unrelated histories if available). Click
   Compare with 3-dot selected.
9. Verify the system fell back to 2-dot and showed the inline notice "No common ancestor;
   showing endpoint diff." [AC5#5 + FR-012]

---

## Scenario 6 — Cancellation during a long compare (FR-025b)

This requires either a very large repo, or `--patience` slowdown. If the test repo is small,
this scenario can be exercised via a synthetic delay (e.g., temporarily wrap `compareRefs` in
the backend with a 5s `setTimeout` for testing).

1. With both slots filled, click Compare.
2. While the loading spinner is showing, click the **Cancel** button rendered next to the spinner in the Commit Details panel.
3. Verify:
   - The spinner disappears.
   - Slots A and B are unchanged (FR-025b).
   - No error toast (Cancellation is a non-toast outcome).
   - Clicking Compare again starts a fresh request normally.

---

## Scenario 7 — Repo switch clears compare state (FR-030 + SC-007)

1. Open Compare panel and fill slots A and B.
2. Click Compare. Verify result renders.
3. Switch to a different repository via the repo selector (or navigate into a submodule via the
   submodule selector).
4. Verify slots A and B are empty in the panel and the Compare result is dismissed.
5. Verify the Compare toolbar button color is back to **default** (idle).

---

## Scenario 8 — Graph A/B markers (FR-026 — FR-028)

1. Run a compare where both A and B resolve to commits visible in the graph viewport.
2. Verify a small "A" badge on the row whose hash matches `aResolvedHash`.
3. Verify a small "B" badge on the row whose hash matches `bResolvedHash`.
4. Verify existing branch/tag/HEAD chips still appear on those rows (FR-027 — markers coexist).
5. Now set slot A to **Working Tree** and slot B to a branch.
6. Click Compare.
7. Verify no "A" badge appears on any row (FR-028 — Working Tree never gets a graph marker).
   "B" badge still appears on the resolved branch tip.

---

## Scenario 9 — Stash rows have NO compare items (FR-017)

1. Stash some changes (`git stash`).
2. In the graph, right-click the stash row.
3. Verify the menu does NOT contain **Set as Base** or **Compare with Base** or
   **Compare these commits**.

---

## Scenario 10 — Cross-session clearing (FR-031 + SC-007)

1. Fill slots A and B and verify a result.
2. `Developer: Reload Window`.
3. Reopen Speedy Git. Verify slots A and B are empty and the Compare button is **default
   color** (no pending state from prior session).

---

## Validation gates

After running every scenario above, run the build/lint gates from the constitution:

```bash
pnpm typecheck     # zero errors
pnpm lint          # zero errors
pnpm build         # clean build
pnpm test          # unit tests pass (parsing helpers, slot equality, default mode)
```

Smoke test in the launched VS Code Extension Development Host: open a real repo, exercise
Scenario 1 + Scenario 2 end-to-end. If either fails, the feature is NOT ready to merge.
