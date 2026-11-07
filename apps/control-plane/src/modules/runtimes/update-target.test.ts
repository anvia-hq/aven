import { describe, expect, test } from "bun:test";

import { updateTarget } from "./update-target";

const latest = (version: string | undefined) => ({ get: async () => version });

describe("what a runner is updated to (decision 0148)", () => {
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

  test("nothing is offered when GitHub cannot be asked or the server is not a release", async () => {
    expect(
      await updateTarget({ build: "0.5.6", isControlPlane: true }, "0.5.6", latest(undefined)),
    ).toBeNull();
    expect(
      await updateTarget({ build: "0.5.6", isControlPlane: true }, undefined, latest("0.9.0")),
    ).toBeNull();
  });
});
