import type {
  FakeRunEnding,
  FakeRunnerConfig,
  FakeRunnerEnv,
  FakeRunnerRun,
  FakeRunnerSwitch,
} from "./types";

export const FAKE_RUNNER_SWITCHES = {
  sandbox: "NO_SANDBOX",
  secret: "FAKE_SECRET",
  questions: "FAKE_QUESTION",
  subagents: "FAKE_SUBAGENTS",
  streamWords: "FAKE_STREAM_WORDS",
  streamLines: "FAKE_STREAM_LINES",
  streamEveryMs: "FAKE_STREAM_MS",
  runEnds: "FAKE_RUN_ENDS",
  runEndsAfterMs: "FAKE_RUN_ENDS_AFTER",
  runFails: "FAKE_RUN_FAILS",
  avenFiles: "FAKE_AVEN_FILES",
  branch: "FAKE_BRANCH",
  processes: "FAKE_PROCESSES",
  updateBusy: "FAKE_UPDATE_BUSY",
  noWorkspace: "FAKE_NO_WORKSPACE",
  steerRefuses: "FAKE_STEER_REFUSES",
  steerAppliesAfterMs: "FAKE_STEER_APPLIES_AFTER",
  build: "FAKE_BUILD",
  canUpdate: "FAKE_CAN_UPDATE",
  stats: "FAKE_STATS",
} as const satisfies Record<string, FakeRunnerSwitch>;

const DECLARED = new Set<string>(Object.values(FAKE_RUNNER_SWITCHES));

export function isFakeRunnerSwitch(name: string): name is FakeRunnerSwitch {
  return DECLARED.has(name);
}

export function fakeRunnerProcessEnv(
  base: FakeRunnerEnv,
  switches: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value === undefined || isFakeRunnerSwitch(name)) continue;
    env[name] = value;
  }
  for (const [name, value] of Object.entries(switches)) {
    if (!isFakeRunnerSwitch(name)) {
      throw new Error(
        `${name} is not a fake runner switch; docs/rules/0006-e2e-fake-runner.md lists them`,
      );
    }
    env[name] = value;
  }
  return env;
}

const given = (env: FakeRunnerEnv, name: FakeRunnerSwitch) => env[name];

const valueOf = (env: FakeRunnerEnv, name: FakeRunnerSwitch) => given(env, name) || undefined;

const on = (env: FakeRunnerEnv, name: FakeRunnerSwitch) => given(env, name) === "1";

function countOf(env: FakeRunnerEnv, name: FakeRunnerSwitch, fallback: number) {
  const count = Number(given(env, name));
  return Number.isFinite(count) && count > 0 ? count : fallback;
}

function afterMsOf(env: FakeRunnerEnv, name: FakeRunnerSwitch) {
  const after = given(env, name);
  const ms = after ? Number(after) : Number.NaN;
  return Number.isFinite(ms) ? ms : undefined;
}

function endingOf(env: FakeRunnerEnv): FakeRunEnding {
  const { runEnds, runEndsAfterMs } = FAKE_RUNNER_SWITCHES;
  if (on(env, runEnds)) return { kind: "at-once" };
  const ms = afterMsOf(env, runEndsAfterMs);
  return ms === undefined ? { kind: "held-open" } : { kind: "after", ms };
}

function runOf(env: FakeRunnerEnv): FakeRunnerRun {
  const { subagents, streamWords, streamLines, streamEveryMs, secret, questions, runFails } =
    FAKE_RUNNER_SWITCHES;
  if (on(env, subagents)) return { kind: "subagents" };
  const words = countOf(env, streamWords, 0);
  const lines = countOf(env, streamLines, 0);
  const everyMs = countOf(env, streamEveryMs, 500);
  if (words > 0) return { kind: "stream", unit: "word", count: words, everyMs };
  if (lines > 0) return { kind: "stream", unit: "line", count: lines, everyMs };
  if (on(env, secret)) return { kind: "secret" };
  const asked = given(env, questions);
  if (asked) return { kind: "questions", count: asked === "2" ? 2 : 1 };
  return { kind: "plain", ending: endingOf(env), failure: valueOf(env, runFails) };
}

export function readFakeRunnerConfig(env: FakeRunnerEnv): FakeRunnerConfig {
  const {
    sandbox,
    build,
    canUpdate,
    stats,
    updateBusy,
    steerAppliesAfterMs,
    steerRefuses,
    avenFiles,
    branch,
    processes,
    noWorkspace,
  } = FAKE_RUNNER_SWITCHES;
  return {
    sandboxStartsRunning: !on(env, sandbox),
    run: runOf(env),
    self: {
      build: valueOf(env, build),
      canUpdate: on(env, canUpdate),
      stats: valueOf(env, stats),
      updateBusyReason: valueOf(env, updateBusy),
    },
    steering: {
      appliesAfterMs: countOf(env, steerAppliesAfterMs, 400),
      refuseReason: valueOf(env, steerRefuses),
    },
    avenFiles: (given(env, avenFiles) ?? "").split(","),
    branch: valueOf(env, branch) ?? "aven/fake-branch",
    backgroundProcesses: on(env, processes),
    noWorkspace: on(env, noWorkspace),
  };
}
