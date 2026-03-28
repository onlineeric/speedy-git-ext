# Feature Specification: Commit Node Hover Tooltip

## 1. Overview
To provide developers with immediate, contextual information about their Git history, the extension will display a detailed tooltip popup when a user hovers over any commit node in the main graph view. This feature aims to improve visibility into repository topology, commit metadata, and sync status without requiring the user to click or navigate away from the graph.

## 2. Interaction Design
* **Trigger:** Mouse hover over a commit node (with a slight delay, e.g., 200ms, to prevent UI flickering during fast mouse movements).
* **Dismissal:** Moving the mouse cursor away from the node or the tooltip area.
* **Interactivity:** The tooltip itself must be interactive, allowing users to move their cursor into the tooltip area to click action buttons or scrolling up and down to see more information (e.g., copy buttons) before it disappears.

## 3. Data Requirements & User Value
The tooltip must render the following information sections if they are available:

### 3.1. Git References (HEAD, Branches, Tags, Stashes)
* **Display:** A list of all Git references that include this commit in their history.
* **Why it's needed:** Provides an immediate understanding of the graph's topology.
* **User Action:** Developers use this to perform impact analysis. Before executing destructive commands like `rebase`, `reset`, or `revert`, they can see exactly which feature branches or release tags will be affected.

### 3.2. Worktree Status
* **Display:** An indicator showing if the commit is currently checked out in an active Git Worktree, including the absolute local path.
* **Why it's needed:** Helps prevent Git lock or conflict issues.
* **User Action:** Users can verify if a branch or commit is safely available for modification, or if it is actively being used in another local workspace.

### 3.3. Remote Sync Status
* **Display:** A visual indicator (icon or text badge) showing whether the commit is "Local Only" or "Pushed to Remote".
* **Why it's needed:** Acts as a quick safety check.
* **User Action:** Users can instantly confirm if their work is safely backed up on the remote server or if a `git push` is still required.

### 3.4. External System Integrations (Extensibility)
* **Display:** Links or IDs for associated Pull Requests (PRs) or Issue Tracker IDs.
* **Why it's needed:** Connects the raw Git history to project management and code review contexts.
* **User Action:** Users can click these IDs to open the relevant web browser page for full context.

## 4. Technical Considerations
* **Performance:** The data fetching for the tooltip must be highly optimized. Data like hashes and refs are available locally, but GPG verification or PR data might require asynchronous loading. The UI should render immediately with local data and display a skeleton or loading state for async data.
* **Rendering:** Developed as a modular React component to ensure it scales perfectly and maintains high frame rates even with repositories containing thousands of commits.