import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import compose from "../../../deploy/docker-compose.yml" with { type: "text" };
import { diagnose } from "./commands/doctor";
import { pendingUpdateFile, writePendingUpdate } from "./pending-update";
import { launchdPlist } from "./service-files";
import { serviceFile } from "./service-unit";
import type { ServiceDefinition } from "./types";

const names = { launchdLabel: "dev.anvia.aven-runner", systemdUnit: "aven-runner" };

let home: string;
let aven: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "aven-doctor-"));
  aven = join(home, "bin", "aven");
});
afterEach(() => rm(home, { recursive: true, force: true }));

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

function definition(command: string): ServiceDefinition {
  return {
    label: names.launchdLabel,
    command: [command, "runner", "run"],
    env: { PATH: "/usr/local/bin:/usr/bin", HOME: home },
    logFile: join(home, "logs", "runner.log"),
  };
}

async function writeUnit(command: string) {
  await write(serviceFile("darwin", names, home)!, launchdPlist(definition(command)));
}

async function runnerEnv() {
  await write(
    join(home, "runner.env"),
    "AVEN_URL=http://localhost:2837\nAVEN_RUNTIME_TOKEN=avrt_x\nAVEN_SANDBOX_IMAGE=ghcr.io/anvia-hq/aven-sandbox:0.3.0\n",
  );
}

const doctor = () => diagnose({ home, binary: "0.3.0", execPath: aven, platform: "darwin" });

const report = (checks: Awaited<ReturnType<typeof diagnose>>, name: string) =>
  checks.find((check) => check.name === name);

test("warns about an update that did not finish, and the server and compose file it left", async () => {
  await write(join(home, "server", ".env"), "AVEN_VERSION=0.2.0\nAVEN_API_PORT=2837\n");
  await write(join(home, "server", "docker-compose.yml"), "services: {}\n");
  await writePendingUpdate(pendingUpdateFile(home), {
    from: "0.2.0",
    to: "0.3.0",
    binary: aven,
    at: "2025-01-01T00:00:00.000Z",
  });

  const checks = await doctor();

  const update = report(checks, "update");
  expect(update?.ok).toBe(false);
  expect(update?.warn).toBe(true);
  expect(update?.detail).toContain("0.3.0");
  expect(update?.detail).toContain("aven update");

  const release = report(checks, "server release");
  expect(release?.ok).toBe(false);
  expect(release?.warn).toBe(true);
  expect(release?.detail).toContain("0.2.0");
  expect(release?.detail).toContain("0.3.0");

  const stale = report(checks, "compose file");
  expect(stale?.ok).toBe(false);
  expect(stale?.warn).toBe(true);
  expect(stale?.detail).toContain("aven update");
});

test("says nothing about an update when none is pending and the server matches", async () => {
  await write(join(home, "server", ".env"), "AVEN_VERSION=0.3.0\nAVEN_API_PORT=2837\n");
  await write(join(home, "server", "docker-compose.yml"), compose);

  const checks = await doctor();

  expect(report(checks, "update")).toBeUndefined();
  expect(report(checks, "server release")).toMatchObject({ ok: true });
  expect(report(checks, "compose file")).toMatchObject({ ok: true });
});

test("warns when the runner service runs a binary that is gone", async () => {
  await runnerEnv();
  await writeUnit(join(home, "old", "aven"));

  const unit = report(await doctor(), "runner unit");

  expect(unit?.ok).toBe(false);
  expect(unit?.warn).toBe(true);
  expect(unit?.detail).toContain(join(home, "old", "aven"));
  expect(unit?.detail).toContain("aven runner install");
});

test("warns when the runner service runs another aven, and passes for this one", async () => {
  await runnerEnv();
  await write(join(home, "old", "aven"), "#!/bin/sh\n");
  await writeUnit(join(home, "old", "aven"));

  const other = report(await doctor(), "runner unit");
  expect(other?.ok).toBe(false);
  expect(other?.detail).toContain(join(home, "old", "aven"));
  expect(other?.detail).toContain(aven);

  await write(aven, "#!/bin/sh\n");
  await writeUnit(aven);

  const matching = report(await doctor(), "runner unit");
  expect(matching?.ok).toBe(true);
  expect(matching?.warn).toBeFalsy();
  expect(matching?.detail).toContain(aven);
});
