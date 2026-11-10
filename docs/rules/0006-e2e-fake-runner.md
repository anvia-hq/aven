# The e2e fake runner and its switches

Status: accepted

Applies to `e2e/` (Playwright). The fake runner is `e2e/fake-runner.ts`: a runner written as a script that connects to the control plane's `/runtimes/connect` socket and answers runs, calls and viewer frames from a script, so a test needs no model, no Docker and no sandbox.

## One list of switches

Every way a test changes what the fake runner does is a switch read once, at start-up, by `readFakeRunnerConfig` in `e2e/fake-runner-config.ts`. That module is the only place a switch name is written: `FAKE_RUNNER_SWITCHES` maps a name for each switch to its environment variable, `e2e/types.ts` types them all in `FakeRunnerSwitch`, and `readFakeRunnerConfig` turns them into one typed config (`FakeRunnerConfig`) that `e2e/fake-runner.ts` reads. A test names neither a `process.env` key nor a parsed value of its own.

A switch a read of `FAKE_RUNNER_SWITCHES` does not know is refused, not ignored: `fakeRunnerProcessEnv` throws on it, so a misspelt switch fails its test rather than quietly doing nothing. The same function drops every declared switch out of the environment it is given before it applies the switches a test asked for, so a `FAKE_*` variable left in the shell the tests are run from cannot change a run. Start the fake runner through it:

```ts
const { threadId } = await threadOnFakeRunner(page, { FAKE_RUN_ENDS: "1" });
```

`threadOnFakeRunner` in `e2e/helpers.ts` is the usual door (a runner of its own, the project `acme/shiny-app`, one thread, and the runner's `EVENT` lines collected). `e2e/machine-monitor.spec.ts` and `e2e/continue-thread.spec.ts` start one of their own with `fakeRunnerProcessEnv`.

## Switches

A boolean switch counts as on when its value is exactly `1`; any other value, or no value, leaves it off.

| Switch                     | Value                                       | The fake runner                                                                      |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NO_SANDBOX`               | `1`                                         | starts every sandbox stopped: a desktop or terminal is closed until a wake           |
| `FAKE_SECRET`              | `1`                                         | the run asks for a secret with `request_secret` and one question, `STRIPE_API_KEY`   |
| `FAKE_QUESTION`            | `1`, or `2`                                 | the run asks one question, or two: its size first, then its color                    |
| `FAKE_SUBAGENTS`           | `1`                                         | the run calls `spawn_agent` for two subagents, one of which fails                    |
| `FAKE_STREAM_WORDS`        | count                                       | the run streams `count` words, one every `FAKE_STREAM_MS`                            |
| `FAKE_STREAM_LINES`        | count                                       | the run streams `count` plan lines, one every `FAKE_STREAM_MS`                       |
| `FAKE_STREAM_MS`           | milliseconds                                | the gap between two streamed pieces; `500` when it says nothing                      |
| `FAKE_RUN_ENDS`            | `1`                                         | the run ends at once, instead of staying open for a steer or a stop                  |
| `FAKE_RUN_ENDS_AFTER`      | milliseconds                                | the run ends after that long                                                         |
| `FAKE_RUN_FAILS`           | message                                     | the run ends in `error` with that message instead of saying `Done.`                  |
| `FAKE_AVEN_FILES`          | `setup`, `ship`, `actions`, comma separated | the fake workspace carries `.aven/setup`, `.aven/ship.md` and `.aven/actions.yml`    |
| `FAKE_BRANCH`              | branch name                                 | `diff.get` says the workspace is on that branch (`aven/fake-branch` when unset)      |
| `FAKE_PROCESSES`           | `1`                                         | `processes.list` answers a running `npm run dev` and a failed `bun test`             |
| `FAKE_SNAPSHOT_FAILS`      | message                                     | `environment.save` fails with that message, after 700 ms, instead of saying it saved |
| `FAKE_STEER_REFUSES`       | reason                                      | `run.steer` is refused with that reason                                              |
| `FAKE_STEER_APPLIES_AFTER` | milliseconds                                | how long after a steer `steer_applied` comes; `400` when it says nothing             |
| `FAKE_UPDATE_BUSY`         | reason                                      | `runner.update` answers `busy` with that reason instead of `started`                 |
| `FAKE_BUILD`               | version                                     | the `build` the runner says in its `hello`                                           |
| `FAKE_CAN_UPDATE`          | `1`                                         | the `hello` says the runner can update itself                                        |
| `FAKE_STATS`               | JSON                                        | the `host.stats` the runner sends after its `hello`                                  |

The reply a run gives is one of five, in this order: subagents, then streamed words, then streamed lines, then a question or a secret, then the plain reply. The first switch that asks for one decides, so `FAKE_SUBAGENTS=1` beside `FAKE_QUESTION=1` narrates subagents and asks nothing, and the three switches that end a run (`FAKE_RUN_ENDS`, `FAKE_RUN_ENDS_AFTER`, `FAKE_RUN_FAILS`) apply to the plain reply only. Ask for one shape per runner.

## State, per thread

A fake runner serves every thread the control plane gives it, so what a thread's sandbox is doing is kept per thread, in `sandboxes` of `e2e/fake-runner.ts`: whether it runs (`NO_SANDBOX` sets where a thread starts) and the desktop lease a takeover takes, which a release gives back and which `sandbox.release` — what archiving a thread asks for — ends for that thread alone. Stream counters and a run's end are kept per run. Waking one thread's sandbox, or putting another one away, leaves every other thread as it was.

The pretend background processes of `FAKE_PROCESSES` are still one list for the runner rather than one per thread: every test that asks for them starts a runner of its own, and no test puts two threads' processes beside each other. Give them a thread of their own the day one does.
