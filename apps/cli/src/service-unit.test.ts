import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { launchdPlist, systemdUnit } from "./service-files";
import { serviceFile, serviceProgram, serviceUnitState } from "./service-unit";
import type { ServiceDefinition } from "./types";

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "aven-unit-"));
});
afterEach(() => rm(home, { recursive: true, force: true }));

function definition(command: string): ServiceDefinition {
  return {
    label: names.launchdLabel,
    command: [command, "runner", "run"],
    env: { PATH: "/usr/local/bin:/usr/bin", HOME: home },
    logFile: join(home, "logs", "runner.log"),
  };
}

async function writeUnit(platform: "darwin" | "linux", command: string) {
  const file = serviceFile(platform, names, home)!;
  await mkdir(dirname(file), { recursive: true });
  const builder = platform === "darwin" ? launchdPlist : systemdUnit;
  await writeFile(file, builder(definition(command)));
  return file;
}

async function writeBinary(path: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "#!/bin/sh\n", { mode: 0o755 });
  return path;
}

test("names the launchd agent and the systemd unit in the home it reads", () => {
  expect(serviceFile("darwin", names, "/home/me")).toBe(
    "/home/me/Library/LaunchAgents/dev.anvia.aven-runner.plist",
  );
  expect(serviceFile("linux", names, "/home/me")).toBe(
    "/home/me/.config/systemd/user/aven-runner.service",
  );
  expect(serviceFile("win32", names, "/home/me")).toBeUndefined();
});

test("reads back the program the builders wrote, with spaces, quotes and percents", async () => {
  const command = '/opt/aven & co/a "b" 100%/aven';
  for (const platform of ["darwin", "linux"] as const) {
    const file = await writeUnit(platform, command);
    expect(serviceProgram(platform, await Bun.file(file).text())).toBe(command);
  }
});

test("passes for a unit that runs this aven", async () => {
  const aven = await writeBinary(join(home, "bin", "aven"));
  const file = await writeUnit("darwin", aven);

  const state = await serviceUnitState({ platform: "darwin", names, execPath: aven, home });

  expect(state?.file).toBe(file);
  expect(state?.program).toBe(aven);
  expect(state?.problem).toBeUndefined();
});

test("warns when the binary the unit runs is not there", async () => {
  const gone = join(home, "bin", "aven");
  await writeUnit("linux", gone);

  const state = await serviceUnitState({
    platform: "linux",
    names,
    execPath: "/usr/local/bin/aven",
    home,
  });

  expect(state?.problem).toContain("is not on this machine");
  expect(state?.problem).toContain(gone);
});

test("warns when the unit runs another aven", async () => {
  const old = await writeBinary(join(home, "old", "aven"));
  await writeUnit("linux", old);

  const state = await serviceUnitState({
    platform: "linux",
    names,
    execPath: "/usr/local/bin/aven",
    home,
  });

  expect(state?.problem).toContain(old);
  expect(state?.problem).toContain("/usr/local/bin/aven");
});

test("a unit that names no program, and no unit at all", async () => {
  expect(
    await serviceUnitState({ platform: "darwin", names, execPath: "/usr/local/bin/aven", home }),
  ).toBeUndefined();

  const file = serviceFile("darwin", names, home)!;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, "<plist><dict></dict></plist>");
  const state = await serviceUnitState({
    platform: "darwin",
    names,
    execPath: "/usr/local/bin/aven",
    home,
  });
  expect(state?.problem).toContain("does not say what it runs");
});
