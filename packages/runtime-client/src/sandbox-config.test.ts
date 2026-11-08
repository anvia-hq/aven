import { describe, expect, test } from "bun:test";

import { sandboxConfigFromEnv } from "./sandbox-config";

describe("sandboxConfigFromEnv", () => {
  test("defaults the image and leaves the rest to Sandboxes", () => {
    expect(sandboxConfigFromEnv({})).toEqual({
      image: "aven-sandbox-desktop:dev",
      platform: undefined,
      runtime: undefined,
      home: undefined,
      memoryMb: undefined,
      cpus: undefined,
      pidsLimit: undefined,
      archivedKeepDays: undefined,
    });
  });

  test("reads every setting, the process limit included", () => {
    const config = sandboxConfigFromEnv({
      AVEN_SANDBOX_IMAGE: "img",
      AVEN_SANDBOX_PLATFORM: "linux/amd64",
      AVEN_SANDBOX_RUNTIME: "runsc",
      AVEN_RUNTIME_HOME: "/srv/aven",
      AVEN_SANDBOX_MEMORY_MB: "4096",
      AVEN_SANDBOX_CPUS: "2",
      AVEN_SANDBOX_PIDS_LIMIT: "512",
      AVEN_ARCHIVED_KEEP_DAYS: "3",
    });
    expect(config).toEqual({
      image: "img",
      platform: "linux/amd64",
      runtime: "runsc",
      home: "/srv/aven",
      memoryMb: 4096,
      cpus: 2,
      pidsLimit: 512,
      archivedKeepDays: 3,
    });
  });

  test("takes 0 days to keep archived workspaces for ever, and refuses a bad number", () => {
    expect(sandboxConfigFromEnv({ AVEN_ARCHIVED_KEEP_DAYS: "0" }).archivedKeepDays).toBe(0);
    expect(() => sandboxConfigFromEnv({ AVEN_ARCHIVED_KEEP_DAYS: "-1" })).toThrow();
    expect(() => sandboxConfigFromEnv({ AVEN_ARCHIVED_KEEP_DAYS: "soon" })).toThrow();
  });

  test("refuses a limit that is not a positive number", () => {
    expect(() => sandboxConfigFromEnv({ AVEN_SANDBOX_PIDS_LIMIT: "lots" })).toThrow(
      'AVEN_SANDBOX_PIDS_LIMIT must be a positive number, got "lots".',
    );
    expect(() => sandboxConfigFromEnv({ AVEN_SANDBOX_CPUS: "0" })).toThrow();
  });
});
