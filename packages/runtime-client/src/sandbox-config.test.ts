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
    });
    expect(config).toEqual({
      image: "img",
      platform: "linux/amd64",
      runtime: "runsc",
      home: "/srv/aven",
      memoryMb: 4096,
      cpus: 2,
      pidsLimit: 512,
    });
  });

  test("refuses a limit that is not a positive number", () => {
    expect(() => sandboxConfigFromEnv({ AVEN_SANDBOX_PIDS_LIMIT: "lots" })).toThrow(
      'AVEN_SANDBOX_PIDS_LIMIT must be a positive number, got "lots".',
    );
    expect(() => sandboxConfigFromEnv({ AVEN_SANDBOX_CPUS: "0" })).toThrow();
  });
});
