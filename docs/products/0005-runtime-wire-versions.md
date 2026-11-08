# Runtime wire versions

Status: current. What each version of the wire between the control plane and a runtime added (`WIRE_VERSION` in `packages/protocol/src/runtime-wire.ts`; decision 0008). A runtime that speaks another version is refused with close code 4000. Add a line here whenever the version goes up.

- **52**: `run.start` and `run.resume` can carry the key the agent's `web_search` tool needs, `webSearch`, so whether that tool is offered no longer depends on the runner's own `TAVILY_API_KEY` and the control plane decides it once.
- **51**: the control plane can have a runner run a command from `.aven/actions.yml` in a thread's sandbox, `actions.run` (a `call` with `{ threadId, command }` that answers with the started process, `ActionRunResult`), which the Background tasks list then shows (decision 0161).
- **50**: `run.attach` can carry the secrets the run was started with, `secrets` (the environment variables, GitHub account, identity credential and MCP servers), so a runner that restarted mid-run signs in and connects again (bug 003).
- **49**: the control plane can ask a runner to update itself, `runner.update` (a `call` with `{ release? }` that answers with a `RunnerUpdateResult`), and `hello` can say `canUpdate` (decision 0146). A runner that has not updated is refused until `aven update`.
- **48**: a runner tells the control plane when a process the agent left running ends while no run of its thread is going, `process.ended`, and the control plane wakes the agent with a note (decision 0144). A runner that has not updated is refused until `aven update`.
- **47**: a run can use the `vertex` provider (decision 0140), which an older runtime would build as an Anthropic client.
- **46**: a run can use the `bedrock` provider (decision 0139), which an older runtime would build as an Anthropic client.
- **45**: a run can use the `gemini` provider (decision 0138), which an older runtime would build as an Anthropic client.
- **44**: the agent shows files with `show_artifact`, several at once, images and MP4 or WebM videos: a tool part and its `tool_end` carry `artifacts` (a list) where they carried one `image`, and `artifacts.read` answers for the two video types too (decision 0136). A runner that has not updated is refused until `aven update`.
- **43**: the agent of a thread forks it, `fork.start`, and looks at a fork, `fork.status`, and `run.start` can say `forkOf`, the thread whose workspace the new thread starts as a copy of (decision 0135). A runner that has not updated is refused until `aven update`.
- **42**: a run and a bot's reply say what the agent may do in the person's cockpit (`cockpit` on `run.start`, `run.resume` and `bot.reply`: `read` for a thread's agent, `write` for a bot), and the agent works it with the calls `cockpit.read` and `bot.cockpit` (decision 0109).
- **41**: a run and a bot's reply carry the agent's memory (`memory` on `run.start`, `run.resume` and `bot.reply`), and the agent works its notes with the calls `memory.notes` and `bot.notes` (decision 0102).
- **40**: a bot can stop a thread's run, `bot.thread` `stop` (decision 0101). A runner that has not updated is refused until `aven update`.
- **39**: the control plane can steer a run that is going, `run.steer` (a `call` with `{ runId, steerId, prompt, mentions? }` that answers with a `SteerResult`), and a run's events can say `steer_applied` (decision 0098; `run.steer` was gone since version 3). A runner that has not updated is refused until `aven update`.
- **38**: `run.start` can say `compact`: the run only summarizes the thread's history, in no sandbox and with no tools (decision 0097). A runner that has not updated is refused until `aven update`.
- **37**: a bot looks at the person's projects and threads and, on their word, starts a thread, sends a message to one of their own and archives one, `bot.thread` (decision 0088). A runner that has not updated is refused until `aven update`.
- **36**: `run.start`, `run.resume` and `bot.reply` carry the person's enabled MCP servers (`mcp`, with their headers in the clear, for the runner to keep in memory), which a runner connects for the run or reply; the runner says how each connected with `mcp.report` (a run) or `bot.mcp` `report` (a bot), and a bot looks at and changes the person's servers with `bot.mcp` (decision 0085) and the person's model providers with `bot.provider`, with no key in any of it (decision 0086). A runner that has not updated is refused until `aven update`.
- **35**: `bot.reply` can carry the person's skills, `skills`, which the runner puts in the bot's `/skills`, and fetches an archive for with `bot.skill` (decision 0081).
- **34**: `bot.reply` can carry the files the person sent with the message, `attachments`, which the runner copies into the bot's computer (decision 0080).
- **33**: a runner lists, stops and reads the logs of the processes in a thread's sandbox, `processes.list`, `processes.stop` and `processes.logs` (decision 0071).
- **32**: a bot's goal, `bot.goal` (get, start, update), a long task the control plane wakes the bot to work on round after round (decision 0068).
- **31**: a bot's schedules, `bot.schedule` (list, create, update, delete), and the person's `timezone` on `bot.reply` (decision 0067).
- **30**: a bot can ask the person to decide, `bot.question`, which answers with where the question went, `relayed` set when the main bot is to ask it (decision 0066).
- **29**: bots write to each other with handles (decision 0065): `bot.reply` carries the bot's `handle` and, for every bot, its `peers` (`handle`, `name`, `description`); a runner can have a message carried to another bot, `bot.send`, which returns at once; `bot.create` answers with the new bot's `handle`; `bot.ask` and its `BotAnswered` are gone.
- **28**: the answer to `bot.ask` names the bot that answered, `bot` (decision 0063).
- **27**: the main bot's reply carries the person's other bots, `peers` on `bot.reply`, and a runner can have it write to one and wait for its answer, `bot.ask` (decision 0063).
- **26**: a bot can change its own name, description and instruction, `bot.update` (decision 0061); `bot.create` can carry a `description`.
- **25**: the bot a runner answers for says whether it may make bots, `canCreateBots` on `bot.reply`, and a runner can ask the control plane to make one, `bot.create` (decision 0060).
- **24**: a runner can answer for a bot, `bot.reply` and `bot.cancel` from the control plane and `bot.say` and `bot.end` back, and reads and adds to the bot's conversation with `bot.memory` (decision 0059).
- **23**: a run's events can carry what a subagent does, `subagent` events and the `subagents` of a `spawn_agent` tool part (decision 0057).
- **22**: a runtime can no longer call `memory.load`, `memory.clear`, `memory.snapshot` or `memory.replacePrefix`; runs keep their history in the durable journal and only add to the transcript with `memory.append` (decision 0021).
- **21**: a runner can run a shell for a thread on a pseudo-terminal, `terminal.open`, `terminal.resize` and `terminal.close` (decision 0053).
- **20**: `run.start` and `run.resume` can carry the credential for minting identity tokens, `identity` (decision 0049).
- **19**: `run.start` and `run.resume` can carry the project's environment variables, `env` (decision 0045).
- **18**: `run.start` and `run.resume` can carry the GitHub account the run acts as, `github` (decision 0044).
- **17**: a runner could be asked to commit and push a thread's branch, `repo.push` (decision 0040); the call is gone, the agent ships with `gh` (decision 0044), and the version was not lowered.
- **16**: the control plane can ask a runner to start a thread's sandbox without a run, `desktop.wake` (decision 0039).
- **15**: `run.start` can carry the files and skills the prompt mentions, and a runner answers `files.search` (decision 0036).
- **14**: `run.start` and `run.resume` carry the run's skills, which a runner fetches with `skills.get` (decision 0035).
- **13**: `run.start` can carry the files the user attached, which a runner copies into the sandbox (decision 0034).
- **12**: a runner keeps the images its agent shows with `show_image` and answers `artifacts.read` (decision 0033).
- **11**: a runner answers `files.list` and `files.read` (decision 0031).
- **10**: a runner answers `diff.get` with a thread's changes (decision 0030).
- **9**: a run survives a dropped connection: its events are numbered, `hello` lists the runs a runtime still holds, and the control plane answers each with `run.attach` or `run.ack` (decision 0023).
- **8**: a run can suspend on the agent's question and be resumed with the answer, `run.resume` (decision 0020).
- **7**: a run can use the `azure` provider (decision 0019), which an older runtime would build as an Anthropic client.
- **6**: a runtime can compact the conversation, `memory.snapshot` and `memory.replacePrefix` (decision 0018).
- **5**: a runtime can stream a thread's desktop to a viewer and answer the control plane's calls about it (decision 0015).
- **4**: a runtime can ask for access to the thread's repository, `repo.access` (decision 0013).
- **3**: a run is only started and cancelled; commands and processes are the sandbox's, so no job notices, job stops or steering (decision 0012).

Not a version: `host.stats` (a runner tells how loaded its machine is, decision 0091) is an optional message. A control plane ignores a frame it does not know and a runner that does not send it shows no load, so it did not change `WIRE_VERSION`.
