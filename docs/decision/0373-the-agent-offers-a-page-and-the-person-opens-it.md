# The agent offers a page and the person opens it

Status: accepted. Amends [0237](0237-a-runners-ports-are-served-on-aven-run-subdomains.md).

## Context

0237 has the person type a port in the Browser panel and confirm it. A person who asked the agent for a dev server had to know that, and the agent could not point at the page it had just started. The panel also asked for a bare port, which read as a field for something else.

## Decision

- The Browser panel's field is an address, `localhost:3000`. It takes a bare port, `:3000`, `localhost`, `127.0.0.1`, `0.0.0.0` or `[::1]` with a port, and an `http(s)://` form of those; any other host is refused. After it opens, the field shows `http://localhost:<port>`. What is served is still one port of the runner, as in 0237.
- The agent has a tool, `open_browser {port}`, that offers a page: the transcript shows a card, "The agent is serving http://localhost:3000", with an Open in Browser button. The click opens the panel and shows 0237's confirmation dialog; nothing is exposed until the person confirms. The tool does not open anything, does not wait, and returns that the person was offered the page. The agent never sees the page.
- 0237's rule that the agent does not open a port holds: an offer is a request to the person, and the denylist of ports is checked by the control plane when the person confirms.

## Consequences

- The tool is registered with the native coding agent, beside `ask_user` and `request_secret`, and its instructions say to start the server and `wait_for_port` first. Claude and Codex runs list only the tools their runner gives them, so they do not have it yet.
- Only the thread's owner has the Browser panel, so an offer on a thread seen by someone else shows the card and opens nothing.
