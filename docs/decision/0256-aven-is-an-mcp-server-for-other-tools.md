# Aven is an MCP server for other tools

Status: accepted. Builds on 0228.

## Context

People want to drive Aven from another harness or agent (a Grok bot, Claude Code, a script): start a thread on a project, watch it, read what it changed. A bot already reaches Aven's whole API as the person (0228), with a catalog built from the routes and a gate that gives each route a tier.

## Decision

- **The server is `POST /mcp` on the control plane**, Streamable HTTP in its stateless form: one JSON-RPC request in, one JSON answer out, no session and no event stream (`GET` and `DELETE` answer 405). It is hand written (`modules/mcp-access/rpc.ts`) because it needs four methods and the transport is a single function; behind the web proxy it is `<origin>/api/mcp`.
- **A token is the login.** A person makes access tokens in Settings > MCP access: a name and a set of permissions, `read`, `change` and `destructive`. The token (`avn_` and 32 random bytes) is shown once, only its SHA-256 and its last four characters are stored (`mcp_access_tokens`), and removing it ends it at once. The person can have 20.
- **The permission is the route's tier.** `GET` is `read`, creating and changing is `change`, and what the bot gate calls `confirm` (deletes, shipping, updating a runner) is `destructive`. A destructive token is the person's own choice to allow them, so it does not ask again: the call goes through the bot API with `confirmed` set. Search shows only the routes the token may call.
- **The tools reuse the bot API**: the generic `aven_workspaces`, `aven_search_api` and `aven_call_api`, and four for the common work, `aven_list_projects`, `aven_start_task` (a thread, then its first message), `aven_get_thread` and `aven_stop_thread`, which are calls to the same routes. A tool a token has no permission for is left out of `tools/list`. They run as the token's owner through the same one-call grant, with the same secret refusal and redaction. A new Aven route is reachable with no change here.
- **The same routes stay blocked** (sign-in, platform settings, runner connections, terminals, event streams, writing secrets), and so do `/mcp` and `/mcp-access`: a token cannot make tokens, and a bot cannot either.
- **Two resources teach the client how to use Aven**: `aven://guide` (what Aven is, the tools, the permissions, and the thread workflow from project to pull request) and `aven://permissions` (what this token holds). The initialize answer carries a one-line instruction that points at the guide.

## Not verified

It was tested with hand-written JSON-RPC against a real server and the web proxy, not with a third-party MCP client. A client that insists on OAuth discovery instead of a configured header is not supported.
