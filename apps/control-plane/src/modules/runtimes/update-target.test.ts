import { describe, expect, test } from "bun:test";

import { updateTarget } from "./update-target";

const latest = (version: string | undefined) => ({ get: async () => version });

describe("what a runner is updated to", () => {
  test("a runner behind the server goes to the server's release, not to GitHub's", async () => {
    const runner = { build: "0.5.5", isControlPlane: false };
    expect(await updateTarget(runner, "0.5.6", latest("0.5.9"))).toBe("0.5.6");
  });

  test("a runner on the server's release has none, however new GitHub's is", async () => {
    const runner = { build: "0.5.6", isControlPlane: false };
    expect(await updateTarget(runner, "0.5.6", latest("0.5.9"))).toBeNull();
  });

  test("the control plane's own runner goes to the newest release when the server is behind it", async () => {
    const own = { build: "0.5.6", isControlPlane: true };
    expect(await updateTarget(own, "0.5.6", latest("0.5.7"))).toBe("0.5.7");
    const current = { build: "0.5.7", isControlPlane: true };
    expect(await updateTarget(current, "0.5.7", latest("0.5.7"))).toBeNull();
    expect(await updateTarget(current, "0.5.7", latest("0.5.6"))).toBeNull();
  });

  test("a server that is not a release build offers the newest release, whoever the runner is", async () => {
    const runner = { build: "0.5.5", isControlPlane: false };
    expect(await updateTarget(runner, undefined, latest("0.5.9"))).toBe("0.5.9");

    const own = { build: "0.5.5", isControlPlane: true };
    expect(await updateTarget(own, undefined, latest("0.5.9"))).toBe("0.5.9");
  });

  test("and nothing when the runner is already that release or GitHub cannot be asked", async () => {
    const runner = { build: "0.5.9", isControlPlane: false };
    expect(await updateTarget(runner, undefined, latest("0.5.9"))).toBeNull();

    const behind = { build: "0.5.5", isControlPlane: true };
    expect(await updateTarget(behind, undefined, latest(undefined))).toBeNull();
  });

  test("nothing is offered when a released server's own runner is current and GitHub cannot be asked", async () => {
    expect(
      await updateTarget({ build: "0.5.6", isControlPlane: true }, "0.5.6", latest(undefined)),
    ).toBeNull();
  });
});
