import { describe, expect, test } from "bun:test";
import type { PlatformConfig } from "@aven/protocol/types";

import type { Runtime } from "./types";
import { summarizeUpdates } from "./update-status";

function makeRuntime(overrides: Partial<Runtime> = {}): Runtime {
  return {
    id: "rt-1",
    name: "runner",
    ownerId: "user-1",
    host: false,
    shared: false,
    githubMode: "machine",
    github: null,
    directories: [],
    tokenHint: "abc",
    online: true,
    build: "0.5.6",
    outdated: false,
    updateTo: null,
    isControlPlane: false,
    isCloud: false,
    parentRuntimeId: null,
    canUpdate: true,
    stats: null,
    lastSeenAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PlatformConfig> = {}): PlatformConfig {
  return {
    registrationEnabled: true,
    githubLogin: false,
    emailLogin: true,
    claudeBackend: true,
    codexBackend: true,
    lens: false,
    isOwner: true,
    platformSettings: true,
    version: "0.5.6",
    updateTo: null,
    ...overrides,
  };
}

const neverUpdating = () => false;

describe("summarizeUpdates", () => {
  test("returns null when server and runners are up to date", () => {
    expect(
      summarizeUpdates({
        config: makeConfig(),
        runtimes: [makeRuntime({ isControlPlane: true }), makeRuntime({ id: "rt-2" })],
        isUpdating: neverUpdating,
      }),
    ).toBeNull();
  });

  test("reports a server update from platform config even without an online built-in runner", () => {
    const summary = summarizeUpdates({
      config: makeConfig({ version: "0.5.6", updateTo: "0.5.9" }),
      runtimes: [],
      isUpdating: neverUpdating,
    });
    expect(summary).toEqual({
      server: { from: "0.5.6", to: "0.5.9", runtime: undefined },
      runners: [],
      updating: false,
      targetVersion: "0.5.9",
      tooltip: "Update available · v0.5.9",
    });
  });

  test("attaches the built-in runner when a server update is available", () => {
    const cp = makeRuntime({
      id: "local",
      name: "Control plane",
      isControlPlane: true,
      updateTo: "0.5.9",
    });
    const summary = summarizeUpdates({
      config: makeConfig({ version: "0.5.6", updateTo: "0.5.9" }),
      runtimes: [cp],
      isUpdating: neverUpdating,
    });
    expect(summary?.server).toEqual({ from: "0.5.6", to: "0.5.9", runtime: cp });
    expect(summary?.runners).toEqual([]);
  });

  test("reports runner-only updates when the server is current or a checkout build", () => {
    const behind = makeRuntime({ id: "rt-2", name: "mac-mini", build: "0.5.5", updateTo: "0.5.9" });
    const summary = summarizeUpdates({
      config: makeConfig({ version: null, updateTo: null }),
      runtimes: [makeRuntime({ isControlPlane: true }), behind],
      isUpdating: neverUpdating,
    });
    expect(summary).toEqual({
      server: null,
      runners: [behind],
      updating: false,
      targetVersion: "0.5.9",
      tooltip: "Update available · v0.5.9",
    });
  });

  test("counts multiple runner updates in tooltip and marks active updates", () => {
    const first = makeRuntime({ id: "rt-1", name: "mac", updateTo: "0.5.9" });
    const second = makeRuntime({ id: "rt-2", name: "linux", updateTo: "0.5.9" });
    const summary = summarizeUpdates({
      config: makeConfig(),
      runtimes: [first, second],
      isUpdating: neverUpdating,
    });
    expect(summary?.tooltip).toBe("2 runner updates available");

    const updating = summarizeUpdates({
      config: makeConfig(),
      runtimes: [first],
      isUpdating: (runtime) => runtime.id === "rt-1",
    });
    expect(updating?.updating).toBe(true);
    expect(updating?.tooltip).toBe("Updating Aven…");
  });
});
