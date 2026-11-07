import { describe, expect, test } from "bun:test";

import type { RuntimeHub } from "../runtimes/hub";
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

function runtime({ failPost = false } = {}) {
  const posted: ControlPlaneToRuntime[] = [];
  const revoked: string[] = [];
  const connection = {
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
    remote: new RemoteRuntime(hub, { issue: () => model, revoke() {} }, identities),
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

  test("ends the credential when the run cannot be posted", () => {
    const { revoked, remote } = runtime({ failPost: true });

    expect(() => remote.start({ thread, prompt: "hi", identity })).toThrow("connection lost");

    expect(revoked).toHaveLength(1);
  });
});
