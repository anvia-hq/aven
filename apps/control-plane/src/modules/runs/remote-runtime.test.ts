import { describe, expect, test } from "bun:test";
import type { ControlPlaneToRuntime, RunGithub, RunModel } from "@aven/protocol/runtime-wire";

import type { RuntimeHub } from "../runtimes/hub";
import { RemoteRuntime } from "./remote-runtime";

const thread = { id: "t1", organizationId: "org-1", runtimeId: "rt-1" };
const model: RunModel = {
  provider: "anthropic",
  gatewayPath: "/gateway/anthropic",
  gatewayToken: "grant",
};
const github: RunGithub = { token: "ghu_a", id: 42, login: "ada", name: "Ada L" };

// A runtime connection that keeps what it was sent.
function runtime() {
  const posted: ControlPlaneToRuntime[] = [];
  const connection = {
    startRun() {},
    endRun() {},
    post: (message: ControlPlaneToRuntime) => posted.push(message),
  };
  const hub = { get: () => connection, cancelRun() {}, closeAll() {} } as unknown as RuntimeHub;
  return { posted, remote: new RemoteRuntime(hub, { issue: () => model, revoke() {} }) };
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
});
