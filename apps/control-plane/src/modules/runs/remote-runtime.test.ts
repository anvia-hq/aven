import { describe, expect, test } from "bun:test";

import { BackendUnavailableError, type RuntimeHub } from "../runtimes/hub";
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

function runtime({ failPost = false, backends = ["native"] } = {}) {
  const posted: ControlPlaneToRuntime[] = [];
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
  const hub = { get: () => connection, cancelRun() {}, closeAll() {} } as unknown as RuntimeHub;
  const identities = {
    issue: () => "avid_credential",
    revoke: (runId: string) => revoked.push(runId),
  };
  return {
    posted,
    revoked,
    issued,
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
    ),
  };
}

describe("a run's message to its runtime", () => {
  test("carries the GitHub account the run acts as, when it has one", () => {
    const { posted, remote } = runtime();

    remote.start({ thread, prompt: "hi", github });
    remote.resume({ thread, continuation: {}, response: {}, github });

    expect(posted.map((message) => message.type)).toEqual(["run.start", "run.resume"]);
    for (const message of posted) {
      expect(message).toMatchObject({ github });
    }
  });

  test("has none for a person who has not connected GitHub", () => {
    const { posted, remote } = runtime();

    remote.start({ thread, prompt: "hi" });

    expect(posted[0]).not.toHaveProperty("github", expect.anything());
    expect(JSON.stringify(posted[0])).not.toContain("ghu_");
  });

  test("carries the sender's MCP servers, and none when they have none", () => {
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

    remote.start({ thread, prompt: "hi", mcp });
    remote.resume({ thread, continuation: {}, response: {}, mcp });
    remote.start({ thread, prompt: "again", mcp: [] });

    expect(posted[0]).toMatchObject({ type: "run.start", mcp });
    expect(posted[1]).toMatchObject({ type: "run.resume", mcp });
    expect(posted[2]).not.toHaveProperty("mcp", expect.anything());
  });

  test("says a run only compacts, and says nothing for a run that does not (decision 0097)", () => {
    const { posted, remote } = runtime();

    remote.start({ thread, prompt: "/compact", compact: true });
    remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ type: "run.start", compact: true });
    expect(posted[1]).not.toHaveProperty("compact", expect.anything());
  });

  test("carries the project's environment variables, and none when it has none", () => {
    const { posted, remote } = runtime();
    const env = [{ name: "DATABASE_URL", value: "postgres://x" }];

    remote.start({ thread, prompt: "hi", env });
    remote.resume({ thread, continuation: {}, response: {}, env });
    remote.start({ thread, prompt: "hi", env: [] });

    expect(posted[0]).toMatchObject({ env });
    expect(posted[1]).toMatchObject({ env });
    expect(posted[2]).not.toHaveProperty("env", expect.anything());
  });

  test("carries a credential for identity tokens, never who the run is", () => {
    const { posted, remote } = runtime();

    remote.start({ thread, prompt: "hi", identity });
    remote.resume({ thread, continuation: {}, response: {}, identity });
    remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ identity: { credential: "avid_credential" } });
    expect(posted[1]).toMatchObject({ identity: { credential: "avid_credential" } });
    expect(posted[2]).not.toHaveProperty("identity", expect.anything());
    expect(JSON.stringify(posted)).not.toContain(identity.email);
  });

  test("carries the web search key the control plane was given, and none without one", () => {
    const { posted, remote } = runtime();
    const webSearch = { apiKey: "tvly-control-plane" };

    remote.start({ thread, prompt: "hi", webSearch });
    remote.resume({ thread, continuation: {}, response: {}, webSearch });
    remote.start({ thread, prompt: "hi" });

    expect(posted[0]).toMatchObject({ type: "run.start", webSearch });
    expect(posted[1]).toMatchObject({ type: "run.resume", webSearch });
    expect(posted[2]).not.toHaveProperty("webSearch", expect.anything());
  });

  test("ends the credential when the run cannot be posted", () => {
    const { revoked, remote } = runtime({ failPost: true });

    expect(() => remote.start({ thread, prompt: "hi", identity })).toThrow("connection lost");

    expect(revoked).toHaveLength(1);
  });

  test("is never sent to a runner that cannot drive the thread's agent backend", () => {
    const { posted, remote } = runtime({ backends: [] });

    expect(() => remote.start({ thread, prompt: "hi" })).toThrow(BackendUnavailableError);
    expect(() => remote.resume({ thread, continuation: {}, response: {} })).toThrow(
      BackendUnavailableError,
    );
    expect(posted).toEqual([]);
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

  test("is the token of the run that asked, whose agent the runner keeps", () => {
    const { issued, remote } = runtime();
    remote.resume({ thread, continuation: continuation("run-asked-1"), response: {} });
    expect(issued).toEqual([{ runId: expect.any(String), tokenOf: "asked-1" }]);
  });

  test("is its own when the continuation does not say which run asked", () => {
    const { issued, remote } = runtime();
    remote.resume({ thread, continuation: {}, response: {} });
    remote.resume({ thread, continuation: continuation("goal-x"), response: {} });
    remote.start({ thread, prompt: "go" } as never);
    expect(issued.map((call) => call.tokenOf)).toEqual([undefined, undefined, undefined]);
  });
});
