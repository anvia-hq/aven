export type FakeRunnerEnv = Record<string, string | undefined>;

export type FakeRunnerSwitch =
  | "NO_SANDBOX"
  | "FAKE_SECRET"
  | "FAKE_QUESTION"
  | "FAKE_SUBAGENTS"
  | "FAKE_STREAM_LINES"
  | "FAKE_STREAM_WORDS"
  | "FAKE_STREAM_MS"
  | "FAKE_RUN_ENDS"
  | "FAKE_RUN_ENDS_AFTER"
  | "FAKE_DIFF_LINES"
  | "FAKE_RUN_FAILS"
  | "FAKE_AVEN_FILES"
  | "FAKE_BRANCH"
  | "FAKE_PROCESSES"
  | "FAKE_NO_WORKSPACE"
  | "FAKE_UPDATE_BUSY"
  | "FAKE_STEER_REFUSES"
  | "FAKE_STEER_APPLIES_AFTER"
  | "FAKE_BUILD"
  | "FAKE_CAN_UPDATE"
  | "FAKE_STATS"
  | "FAKE_DIRS";

export type FakeRunEnding =
  | { kind: "at-once" }
  | { kind: "after"; ms: number }
  | { kind: "held-open" };

export type FakeRunnerRun =
  | { kind: "subagents" }
  | { kind: "stream"; unit: "word" | "line"; count: number; everyMs: number }
  | { kind: "secret" }
  | { kind: "questions"; count: 1 | 2 }
  | { kind: "plain"; ending: FakeRunEnding; failure: string | undefined };

export type FakeRunnerSelf = {
  build: string | undefined;
  canUpdate: boolean;
  stats: string | undefined;
  dirs: string[];
  diffLines: number;
  updateBusyReason: string | undefined;
};

export type FakeRunnerSteering = {
  appliesAfterMs: number;
  refuseReason: string | undefined;
};

export type FakeRunnerConfig = {
  sandboxStartsRunning: boolean;
  run: FakeRunnerRun;
  self: FakeRunnerSelf;
  steering: FakeRunnerSteering;
  avenFiles: readonly string[];
  branch: string;
  backgroundProcesses: boolean;
  noWorkspace: boolean;
};
