# v2.0.0 idea spec

A few changes as below, majorly related to the top control bar and GraphContainer 

## Re-arrange the UI area

our current UI areas are

```text
App
|--- ControlBar
|    |--- RepoSelector
|    |--- MultiBranchDropdown
|    |--- Refresh button
|    |--- Fetch button
|    |--- Search button
|    |--- Manage Remotes button
|    |--- Settings button
|    |--- RemoteManagementDialog
|--- Main content area
|    |--- GraphContainer
|    |    |--- CherryPickConflictBanner
|    |    |--- RebaseConflictBanner
|    |    |--- SubmoduleBreadcrumb
|    |    |--- SearchWidget
|    |    |--- SubmoduleSection
|    |    |    |--- SubmoduleRow
|    |    |--- Virtualized commit list
|    |    |    |--- CommitRow
|    |    |--- CommitTooltip
|    |--- CommitDetailsPanel
|--- ConfirmDialog
|--- ToastContainer
```

I want to better organize the UI areas, add one panel area on top of commitDetailsPanel, use to do filter, search, compare, etc.
Idea:
```text
App
|--- ControlBar
|    |--- RepoSelector
|    |--- MultiBranchDropdown
|    |--- Filter button     // new
|    |--- Search button
|    |--- Refresh button
|    |--- Fetch button
|    |--- Compare button    // new
|    |--- Manage Remotes button
|    |--- Settings button
|    |--- RemoteManagementDialog
|--- Main content area
|    |--- GraphContainer
|    |    |--- CherryPickConflictBanner
|    |    |--- RebaseConflictBanner
|    |    |--- SubmoduleBreadcrumb
|    |    |--- TogglePanel      // new, only show one widget at a time
|    |    |    |--- FilterWidget    // new
|    |    |    |--- SearchWidget
|    |    |    |--- CompareWidget    // new
|    |    |--- SubmoduleSection
|    |    |    |--- SubmoduleRow
|    |    |--- Virtualized commit list
|    |    |    |--- CommitRow
|    |    |--- CommitTooltip
|    |--- CommitDetailsPanel
|--- ConfirmDialog
|--- ToastContainer
```
### UI changes
- Filter, Search, Refresh, Fetch and Compare buttons change to icons
- Filter, Search and Compare are button toggle the TogglePanel, they should have 3 status
    - click on it, toggle panel open and show it's wiget. The button itself show a opened color (yellow or orange)
    - click on it again, or click on another toggle button, this button off, show either closed color (gray) or filtered color (purple or red, only for filter button).
        - closed status and filter button when no filter applied, normal button color (gray)
        - filter button closed and filter exists, purple or red color
- All icon button should have a tooltip to show the button function

## what to complete
finish the UI changes and component refactor.
The existing buttons should work as before, included search, refresh, fetch
filter and compare button should toggle an empty panel with a text on it to identify the panel type.
toggle button status color should be constant, for easy change the color. all button use the same color scheme.
the toggle panel when display different widget, the height will be different, the height should be auto adjusted, the commitRow component in below should place below the toggle panel follow the height change.