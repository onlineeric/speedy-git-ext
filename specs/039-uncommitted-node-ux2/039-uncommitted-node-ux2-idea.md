# Uncommitted Node UX2 Idea

## Overview

update the "Select files for..." dialog

## Updates on the "Select files for..." dialog

- The file list should reuse the component as the commit details panel, which provide list and tree view modes.
- Since we have 2 lists: staged and unstaged, each list should has 2 views, but only one set of view buttons should be shown, we should only show on top of the staged list.
- the view should be stored and resumed from stage, that logic already exists in the commit details panel, we should reuse it and just share the same state as commit details panel. Means if commit details panel changed to list view, it stored the view mode in state, then "Select files for..." dialog should also apply the same view mode.
- after each file in file list should show the same like the commit details panel, which is: number of lines added and deleted (+?? -??)
