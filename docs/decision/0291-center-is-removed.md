# 0291. Center is removed

Status: accepted. Supersedes 0131 and 0132.

Center was a screen of its own at `/center`: the pull requests and the latest commits of every project, with filters, quick views, a detail drawer and a project's branches. A project's page already shows its commits and pull requests, and Center was little used.

- The `center` module, its two routes (`/center` and `/center/`), its entry in the desktop rail and the phone's tab bar, its e2e spec and `diff-file-card.tsx`, which only it used, are removed. The route tree is regenerated.
- The API stays: `GET /projects/:id/pulls`, `/pulls/:number`, `/commits`, `/commits/:sha` and `/branches` are still read by the project page and listed in the MCP guide.
- A link to `/center` now reaches the not-found page.
