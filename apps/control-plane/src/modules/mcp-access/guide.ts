export const GUIDE_URI = "aven://guide";

export const PERMISSIONS_URI = "aven://permissions";

export const INSTRUCTIONS =
  "Aven runs coding agents on the person's own machines. Read aven://guide first. Use aven_workspaces to find the workspace, aven_search_api to find a route, and aven_call_api to call it.";

export const GUIDE = `# Using Aven from another harness

Aven is a platform where coding agents run on the person's own machines (runners), in project folders. This server gives you the same API the Aven web app uses, as the person who made your access token, limited to the permissions they chose.

## The three tools

- \`aven_workspaces\`: the workspaces (organizations) this person is in. Most routes work inside one workspace, so pass its \`organizationId\` to \`aven_call_api\`. It can be left out when the person has only one.
- \`aven_search_api\` \`{ query? }\`: find routes. Every word of the query must appear in the route (\`threads messages\`, \`projects\`). Each route shows its \`tier\` and, for a route with a body, the body's JSON schema.
- \`aven_call_api\` \`{ method, path, body?, organizationId? }\`: call a route. The answer is \`{ status, body }\`. A status of 400 or more is returned as an error with the body Aven sent back.

Read \`${PERMISSIONS_URI}\` to see what this token may do.

## Permissions

A route has a tier, and the token needs the matching permission:

- \`read\` (tier \`read\`): every GET.
- \`change\` (tier \`change\`): creating and changing things, and sending a message to an agent.
- \`destructive\` (tier \`confirm\`): deleting, and routes that are hard to undo, such as shipping a thread.

Some routes are never available through a token: sign-in, platform settings, runner connections, secrets, terminals and event streams. A call that sends a secret (a body with a token or password in it) is refused.

## The workflow people want most: give an agent a task

1. Find the project: \`GET /projects\`. A project is a folder on a runner, with an \`id\`, a name and the runner it lives on. To add one, \`POST /projects/folder\` \`{ runtimeId, path, name? }\` for a folder that is already on the runner, or \`POST /projects/repository\` \`{ runtimeId, repository, name? }\` to clone a repository onto it. \`GET /runtimes\` lists the runners and whether each is connected.
2. Make a thread: \`POST /threads\` \`{ projectId, title?, backend? }\`. \`backend\` is \`native\` (a model key from Providers) or \`claude\` (the person's Claude subscription). The answer has the thread's \`id\`.
3. Give it the task: \`POST /threads/{id}/messages\` \`{ prompt, providerId?, modelId?, reasoningEffort? }\`. This starts the agent and answers at once; the agent keeps working.
4. Watch it: \`GET /threads/{id}\`. \`running\` says whether the agent is still working, and \`messages\` is the conversation so far, including what the agent did and said. Poll every few seconds until \`running\` is false.
5. Look at what it changed: \`GET /threads/{id}/diff\`. Steer it with another \`POST /threads/{id}/messages\`. Stop it with \`POST /threads/{id}/cancel\`.
6. Publish the work: \`POST /threads/{id}/ship\` makes a pull request from the thread's branch (it needs the \`destructive\` permission). \`GET /threads/{id}/branch-pull-requests\` shows the pull requests.

## Other things you can reach

- \`GET /threads\`: the threads in the workspace. \`PATCH /threads/{id}\` renames, archives or snoozes one.
- \`/bots\`: the person's bots. \`POST /bots/{id}/messages\` \`{ text }\` writes to a bot, which answers in its own chat.
- \`/cockpit\`: the person's inbox, tasks and notes.
- \`/memory\`: the person's notes the agents remember.
- \`/skills\`, \`/mcp-servers\`, \`/providers\`, \`/schedules\`: the person's settings for agents.
- \`GET /projects/{id}/files\`, \`/readme\`, \`/commits\`, \`/pulls\`, \`/branches\`: look inside a project.

\`aven_search_api\` shows the rest, with each route's body.

## Good habits

- Search before you call a route you have not used: the bodies are exact, and a wrong field is a 400.
- Ids are UUIDs. Take them from a list answer, never guess them.
- A thread belongs to one workspace. Pass the same \`organizationId\` for every call about it.
- An agent can take minutes. Poll \`GET /threads/{id}\` with a pause between calls, and do not send a second task while \`running\` is true unless you mean to steer it.
`;
