import { describe, expect, test } from "bun:test";

import { BackendUnavailableError, RuntimeOfflineError, type RuntimeHub } from "../runtimes/hub";
import { LOCAL_RUNTIME_ID } from "../runtimes/service";
import { RemoteRuntime } from "./remote-runtime";
import type { ControlPlaneToRuntime, RunGithub, RunModel } from "@aven/protocol/types";

const thread = { id: "t1", organizationId: "org-1", runtimeId: "rt-1" };
const model: RunModel = {
  provider: "anthropic",
  gatewayPath: "/gateway/anthropic",
  gatewayToken: "grant",
};
const identity = {
  organizationId: "org-1",
  projectId: "p1",
  threadId: "t1",
  userId: "u1",
  email: "ada@example.com",
};
const github: RunGithub = { token: "ghu_a", id: 42, login: "ada", name: "Ada L" };

function runtime({
  failPost = false,
  backends = ["native"],
  builtIn = true,
  agentOnControlPlane = true,
} = {}) {
  const posted: ControlPlaneToRuntime[] = [];
  const asked: string[] = [];
  const cancelled: string[] = [];
  const revoked: string[] = [];
  const issued: { runId: string; tokenOf: string | undefined }[] = [];
  const connection = {
    offers: (kind: string) => backends.includes(kind),
    startRun() {},
    endRun() {},
    post(message: ControlPlaneToRuntime) {
      if (failPost) throw new Error("connection lost");

      posted.push(message);
    },
  };
  const hub = {
    get: (runtimeId: string) => {
      asked.push(runtimeId);
      return runtimeId === LOCAL_RUNTIME_ID && !builtIn ? undefined : connection;
    },
    cancelRun: (runtimeId: string) => cancelled.push(runtimeId),
    closeAll() {},
  } as unknown as RuntimeHub;
  const identities = {
    issue: () => "avid_credential",
    revoke: (runId: string) => revoked.push(runId),
  };
  return {
    posted,
    revoked,
    issued,
    asked,
    cancelled,
    remote: new RemoteRuntime(
      hub,
      {
        issue: (runId: string, _config: unknown, _scope?: string, tokenOf?: string) => {
          issued.push({ runId, tokenOf });
          return model;
        },
        revoke() {},
      },
      identities,
      agentOnControlPlane,
    ),
  };
}

describe("a run's message to its runtime", () => {
  test("carries the GitHub account the run acts as, when it has one", async () => {
    const { posted, remote } = runtime();

    await remote.start({ thread, prompt: "hi", github });
    await remote.resume({ thread, continuation: {}, response: {}, github });

    expect(posted.map((message) => message.type)).toEqual(["run.start", "run.resume"]);
    for (const message of posted) {
      expect(message).toMatchObject({ github });
    }
  });

  test("has none for a person who has not connected GitHub", async () => {
    const { posted, remote } = runtime();

    await remote.start({ thread, prompt: "hi" });

    expect(posted[0]).not.toHaveProperty("github", expect.anything());
    expect(JSON.stringify(posted[0])).not.toContain("ghu_");
  });

  test("carries the sender's MCP servers, and none when they have none", async () => {
    const { posted, remote } = runtime();
    const mcp = [
      {
        id: "m1",
        name: "Notes",
        url: "https://mcp.example.com/mcp",
        headers: { Authorization: "Bearer abc" },
        allowLocal: false,
      },
    ];

    await remote.start({ thread, prompt: "hi", mcp });
    await remote.resume({ thread, continuation: {}, response: {}, mcp });
    await remote.start({ thread, prompt: "again", mcp: [] });

    expect(posted[0]).toMatchObject({ type: "run.start", mcp });
    expect(posted[1]).toMatchObject({ type: "run.resume", mcp });
    expect(posted[2]).not.toHaveProperty("mcp", expect.anything());
  });

  test("says a run only compacts, and says nothing for a run that does not (decision 0097)", async () => {
    const { posted, remote } = runtime();

    await remote.start({ thread, prompt: "/compact", compact: true });
    await remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ type: "run.start", compact: true });
    expect(posted[1]).not.toHaveProperty("compact", expect.anything());
  });

  test("carries the project's environment variables, and none when it has none", async () => {
    const { posted, remote } = runtime();
    const env = [{ name: "DATABASE_URL", value: "postgres://x" }];

    await remote.start({ thread, prompt: "hi", env });
    await remote.resume({ thread, continuation: {}, response: {}, env });
    await remote.start({ thread, prompt: "hi", env: [] });

    expect(posted[0]).toMatchObject({ env });
    expect(posted[1]).toMatchObject({ env });
    expect(posted[2]).not.toHaveProperty("env", expect.anything());
  });

  test("carries a credential for identity tokens, never who the run is", async () => {
    const { posted, remote } = runtime();

    await remote.start({ thread, prompt: "hi", identity });
    await remote.resume({ thread, continuation: {}, response: {}, identity });
    await remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ identity: { credential: "avid_credential" } });
    expect(posted[1]).toMatchObject({ identity: { credential: "avid_credential" } });
    expect(posted[2]).not.toHaveProperty("identity", expect.anything());
    expect(JSON.stringify(posted)).not.toContain(identity.email);
  });

  test("carries the web search key the control plane was given, and none without one", async () => {
    const { posted, remote } = runtime();
    const webSearch = { apiKey: "tvly-control-plane" };

    await remote.start({ thread, prompt: "hi", webSearch });
    await remote.resume({ thread, continuation: {}, response: {}, webSearch });
    await remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ type: "run.start", webSearch });
    expect(posted[1]).toMatchObject({ type: "run.resume", webSearch });
    expect(posted[2]).not.toHaveProperty("webSearch", expect.anything());
  });

  test("ends the credential when the run cannot be posted", async () => {
    const { revoked, remote } = runtime({ failPost: true });

    await expect(remote.start({ thread, prompt: "hi", identity })).rejects.toThrow(
      "connection lost",
    );

    expect(revoked).toHaveLength(1);
  });

  test("carries the backend the thread records, and native when the thread records none", async () => {
    const { posted, remote } = runtime();
    const offered = runtime({ backends: ["native", "other"] });

    await remote.start({ thread, prompt: "hi" });
    await remote.resume({ thread, continuation: {}, response: {} });
    await remote.start({ thread: { ...thread, agentBackend: "native" }, prompt: "again" });
    await offered.remote.start({
      thread: { ...thread, agentBackend: "other" as "native" },
      prompt: "elsewhere",
    });
    await offered.remote.resume({
      thread: { ...thread, agentBackend: "other" as "native" },
      continuation: {},
      response: {},
    });

    expect(posted[0]).toMatchObject({ type: "run.start", backend: "native" });
    expect(posted[1]).toMatchObject({ type: "run.resume", backend: "native" });
    expect(posted[2]).toMatchObject({ type: "run.start", backend: "native" });
    expect(offered.posted[0]).toMatchObject({ type: "run.start", backend: "other" });
    expect(offered.posted[1]).toMatchObject({ type: "run.resume", backend: "other" });
  });

  test("is never sent to a runner that cannot drive the thread's agent backend", async () => {
    const { posted, remote } = runtime({ backends: [] });

    await expect(remote.start({ thread, prompt: "hi" })).rejects.toThrow(BackendUnavailableError);
    await expect(remote.resume({ thread, continuation: {}, response: {} })).rejects.toThrow(
      BackendUnavailableError,
    );
    expect(posted).toEqual([]);
  });
});

describe("a Claude run", () => {
  const token = "setup-token-remote-runtime-0001";

  test("runs on the thread's machine, with that run's token, and does not ask the model gateway", async () => {
    const claude = runtime({ backends: ["native", "claude"] });
    const native = runtime();
    await claude.remote.start({
      thread: { ...thread, agentBackend: "claude" },
      prompt: "go",
      claudeToken: token,
      claudeModel: "claude-opus-4-8",
    });
    await claude.remote.resume({
      thread: { ...thread, agentBackend: "claude" },
      continuation: {},
      response: {},
      claudeToken: token,
      claudeModel: "claude-sonnet-5",
    });
    await native.remote.start({ thread, prompt: "go" });

    expect(claude.issued).toEqual([]);
    expect(claude.asked).toEqual([thread.runtimeId, thread.runtimeId]);
    expect(claude.posted[0]).toMatchObject({
      type: "run.start",
      backend: "claude",
      claudeToken: token,
      claudeModel: "claude-opus-4-8",
    });
    expect(claude.posted[1]).toMatchObject({
      type: "run.resume",
      backend: "claude",
      claudeToken: token,
      claudeModel: "claude-sonnet-5",
    });
    expect(claude.posted[0]).not.toHaveProperty("model");
    expect(JSON.stringify(native.posted[0])).not.toContain(token);
    expect(native.issued).toHaveLength(1);
  });
});

describe("where a run's agent runs (decision 0222)", () => {
  const sentThread = (posted: ControlPlaneToRuntime[]) =>
    (posted[0] as Extract<ControlPlaneToRuntime, { type: "run.start" }>).thread;

  test("on the control plane's runner, naming the thread's runtime as its machine", async () => {
    const { posted, asked, cancelled, remote } = runtime();
    const run = await remote.start({ thread, prompt: "go" } as never);
    run.cancel("stop");

    expect(asked).toEqual([LOCAL_RUNTIME_ID]);
    expect(sentThread(posted)).toMatchObject({ id: thread.id, machine: thread.runtimeId });
    expect(cancelled).toEqual([LOCAL_RUNTIME_ID]);
  });

  test("starts even when the machine is offline, but not when the control plane has no runner", async () => {
    const { posted, remote } = runtime();
    await remote.start({ thread, prompt: "go" } as never);
    expect(posted).toHaveLength(1);

    const without = runtime({ builtIn: false });
    await expect(without.remote.start({ thread, prompt: "go" } as never)).rejects.toBeInstanceOf(
      RuntimeOfflineError,
    );
  });

  test("on its runtime's own runner when the control plane has no runner of its own (AVEN_LOCAL_RUNNER=off)", async () => {
    const { posted, asked, cancelled, remote } = runtime({ agentOnControlPlane: false });
    const run = await remote.start({ thread, prompt: "go" } as never);
    run.cancel("stop");

    expect(asked).toEqual([thread.runtimeId]);
    expect(sentThread(posted).machine).toBeUndefined();
    expect(cancelled).toEqual([thread.runtimeId]);
  });

  test("a Codex run stays on the thread's runtime and is not given a gateway token", async () => {
    const { posted, asked, issued, remote } = runtime({ backends: ["native", "codex"] });
    await remote.start({
      thread: { ...thread, agentBackend: "codex" },
      prompt: "go",
      codexLogin: "login-value",
      codexModel: "gpt-5.4",
    } as never);

    expect(asked).toEqual([thread.runtimeId]);
    expect(issued).toEqual([]);
    expect(posted[0]).toMatchObject({
      type: "run.start",
      backend: "codex",
      codexLogin: "login-value",
      codexModel: "gpt-5.4",
    });
    expect(posted[0]).not.toHaveProperty("model");
  });

  test("a thread on the control plane's own runtime runs there, naming no machine", async () => {
    const { posted, remote } = runtime();
    await remote.start({
      thread: { ...thread, runtimeId: LOCAL_RUNTIME_ID },
      prompt: "go",
    } as never);
    expect(sentThread(posted).machine).toBeUndefined();
  });
});

describe("the gateway token of a run that answers a question", () => {
  const continuation = (agentId: string) => ({
    version: 1,
    agentId,
    sourceRunId: "durable-1",
    interaction: {
      type: "tool-question",
      id: "i1",
      toolName: "ask_user",
      toolCallId: "c1",
      internalCallId: "ic1",
      questions: [{ id: "q1", text: "Which?" }],
    },
    state: {},
  });

  test("is the token of the run that asked, whose agent the runner keeps", async () => {
    const { issued, remote } = runtime();
    await remote.resume({ thread, continuation: continuation("run-asked-1"), response: {} });
    expect(issued).toEqual([{ runId: expect.any(String), tokenOf: "asked-1" }]);
  });

  test("is its own when the continuation does not say which run asked", async () => {
    const { issued, remote } = runtime();
    await remote.resume({ thread, continuation: {}, response: {} });
    await remote.resume({ thread, continuation: continuation("goal-x"), response: {} });
    await remote.start({ thread, prompt: "go" } as never);
    expect(issued.map((call) => call.tokenOf)).toEqual([undefined, undefined, undefined]);
  });
});
