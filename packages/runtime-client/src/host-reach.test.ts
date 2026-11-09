import { describe, expect, test } from "bun:test";

import { checkSandboxReach, containerReachesHost, reachCheckScript } from "./host-reach";

const answering = (code: number, stdout = "", stderr = "") => {
  const calls: string[][] = [];
  const docker = async (args: string[]) => {
    calls.push(args);
    return { code, stdout, stderr };
  };
  return { calls, docker };
};
const reachable = () => answering(0, "reachable\n");
const blocked = () => answering(0, "blocked\n");

describe("whether a container reaches the machine it runs on", () => {
  test("asks the container to open a connection to the host's port", () => {
    expect(reachCheckScript("host.docker.internal", 4321)).toBe(
      "timeout 3 bash -c 'echo > /dev/tcp/host.docker.internal/4321' 2>/dev/null && echo reachable || echo blocked",
    );
  });

  test("only a connection the container itself reports blocked is blocked", async () => {
    expect(await containerReachesHost(reachable().docker, "c", "h", 1)).toBe(true);
    expect(await containerReachesHost(blocked().docker, "c", "h", 1)).toBe(false);
  });

  test("a container that is not running or has no shell is not blamed on the firewall", async () => {
    const notRunning = answering(1, "", "Error response from daemon: container is not running");
    expect(await containerReachesHost(notRunning.docker, "c", "h", 1)).toBe(true);
    expect(
      await containerReachesHost(answering(127, "", "bash: not found").docker, "c", "h", 1),
    ).toBe(true);
    expect(await containerReachesHost(answering(126).docker, "c", "h", 1)).toBe(true);
  });

  test("a container the check cannot run in is not blamed on the firewall", async () => {
    const broken = async () => {
      throw new Error("docker is gone");
    };
    expect(await containerReachesHost(broken, "c", "h", 1)).toBe(true);
  });

  test("runs a throwaway container of the image against a listener of its own", async () => {
    const { calls, docker } = reachable();
    const reach = await checkSandboxReach(
      { image: "img:1", platform: "linux/amd64", runtime: "runsc" },
      docker,
    );
    expect(reach.ok).toBe(true);
    const args = calls[0]!;
    expect(args.slice(0, 4)).toEqual([
      "run",
      "--rm",
      "--add-host",
      "host.docker.internal:host-gateway",
    ]);
    expect(args).toContain("runsc");
    expect(args).toContain("linux/amd64");
    expect(args).toContain("img:1");
    expect(args.at(-1)).toMatch(/\/dev\/tcp\/host\.docker\.internal\/\d+'/);
  });

  test("says what to do when the container cannot get through", async () => {
    const reach = await checkSandboxReach({ image: "img" }, blocked().docker);
    expect(reach.ok).toBe(false);
    expect(reach.detail).toContain("sudo ufw allow in on docker0");
  });

  test("does not fail the check when it could not run", async () => {
    const reach = await checkSandboxReach(
      { image: "img" },
      answering(125, "", "no such image").docker,
    );
    expect(reach).toMatchObject({ ok: true, skipped: true });
    expect(reach.detail).toContain("no such image");
  });
});
