# The commit history is drawn as a graph

Status: accepted. Extends 0089 (the project page shows the commit history) and 0082.

## Context

The commit list (0089) shows what changed, but not how: which commits were made on a branch and merged, and where a branch left and came back. The person asked for the lines of a git graph, as in GitKraken or a git graph extension.

## Decision

- **The graph is drawn from the parents of the commits on the page.** GitHub's commit list gives each commit's parents, the first being the branch it was made on. The default branch's history includes every branch merged into it, so a merge shows its branch as a second line that opens at the merge and closes at the commit the branch began from, without reading any other branch's commits. The list is still the default branch's, a page of ten at a time, and as deep as the history.
- **Lanes come from one small pure function**, `layoutGraph` in `@aven/protocol/commit-graph`: commits newest first in, a row each out with the lane of its dot and the lanes whose lines come from above (`up`), pass it (`through`) or leave below (`down`), as `git log --graph` lays them out. A lane waits for the commit it leads to; a commit takes the lane of the first one waiting for it, or a free one, and hands it to its first parent; the other parents of a merge join the lane already waiting for them or open one.
- **The platform draws each row as an SVG** of fixed height with no gap between rows, so a line that leaves a row is the one that enters the next (`commit-graph.tsx`): vertical lines, curves where a line changes lane, a dot per commit. A history with more than eight lanes is cut off at the edge. A lane's colour is its number among six semantic tokens, `graph-1` to `graph-6` (in `index.css`, both themes), so a lane keeps its colour down the page and not from one page to the next.
- **Branch names are chips beside the commit a branch ends on**, from GitHub's branch list (`GET /repos/…/branches`, up to 100, listed by name), asked in the same moment as the page. The default branch is also asked for by its own name (`GET /repos/…/branches/<name>`), because a repository with more than a page of branches can have it on a later one (found on `oven-sh/bun`, whose first 100 branches stop before `main`). The default branch's chip is filled and comes first; past two, a count says how many more, with their names as its title. A branch list that cannot be read leaves the page without chips and does not fail it.
- **A page is drawn on its own.** What leaves the bottom of a page continues as a line to its edge, and a commit whose children are on the page above starts with no line from above. Lanes can differ between pages.

## Consequences

- A branch that has not been merged is not in the graph, only a chip if its latest commit is on the page, which an unmerged branch's is not. Showing every branch, as GitKraken does, would take GitHub's GraphQL (each branch's history and parents in one request) and a window of the newest commits over all of them instead of one branch's pages; that is a bigger change and may follow.
- A history that squash-merges, which GitHub's pull requests can, is a straight line: the graph shows what the history holds.
- Commits are listed by date, so a commit whose clock was wrong can come before its child: its line then runs to the bottom of the page. That is how `git log` orders them too.
- Each page is three GitHub requests (commits, branches and the default branch), and nothing is cached. Other branches past the first 100 get no chip.
