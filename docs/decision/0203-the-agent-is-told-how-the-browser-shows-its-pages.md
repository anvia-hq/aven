# 0203: The agent is told how the Browser shows its pages

Status: superseded by 0219 (the container sandbox, Desktop, Browser and snapshots are retired). Was: accepted. Builds on 0199 (the Browser shows a port of the sandbox).

## Context

A thread's agent started a Vite app and an API and then told the person it could not show them: `list_ports` listed no published port, so it believed nothing could be reached, and it set the app's API address to `http://localhost:3000`. In the Browser tab the page runs in the person's browser, where `localhost` is their own machine, so the sign-up form said "Could not connect to the server" although the API answered 200 from inside the sandbox. Nothing in the agent's instructions said that the Browser exists or what a page in it can reach.

## Decision

- **The agent's instructions have a `<browser>` section.** It says that the person opens any port a server listens on in the sandbox from the Browser tab, so the agent starts the server in the background, checks it with `wait_for_port` and says which port to enter, and that `list_ports` (published ports) is not how this works.
- **It says that the page's own code runs in the person's browser**, where `localhost` and `127.0.0.1` are their machine: browser code calls its own origin with relative URLs (`/api/...`), and the dev server forwards them (Vite's `server.proxy`, Next's `rewrites`, webpack's `devServer.proxy`), never a base URL of `http://localhost:<port>`. Code that runs in the sandbox can use `localhost`.
- **It says that the app is not asked to change for the address**: Aven makes each request look as if it came from `localhost:<port>` (`Host`, `Origin`, redirects, 0199), so a dev server's host check and a sign-in library's origin check that expect `localhost` keep working, and the agent leaves them.
- **It asks the agent to check the page as the person will see it** (the dev server's port, including one API call through it) and to say what it could not look at.
- **No variable gives the agent the Browser's address**: the app never needs it, since it is made to see `localhost`, and a page's address is the person's to open.

## Consequences

- An app whose browser code calls another port on `localhost` still fails in the Browser, as 0199 said; the agent is now told why and what to change, and the change (a dev-server proxy) is one the project keeps for local work too.
- The section is in the instructions of every thread, whether or not the server has set up the Browser (`AVEN_BROWSER_ORIGIN`). Without it the tab says so and the agent's advice costs a line.
- The behavior is checked in a browser against a real Vite dev server and an API behind its proxy (`e2e/browser-real-app.spec.ts`): the page, an API call and a cookie through the proxy, a `POST` that reaches the app with a `localhost` `Origin`, the hot-reload socket, a reload when a file changes, and a call to a `localhost` port that fails.
