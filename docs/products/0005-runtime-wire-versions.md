# Runtime wire versions

Status: current. What each version of the wire between the control plane and a runtime added (`WIRE_VERSION` in `packages/protocol/src/runtime-wire.ts`; decision 0008). A runtime that speaks another version is refused with close code 4000. Add a line here whenever the version goes up.

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
