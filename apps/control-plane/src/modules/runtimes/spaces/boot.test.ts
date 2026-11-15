import { describe, expect, test } from "bun:test";

import {
  SPACES_BOOT_COMMAND,
  SPACES_BOOT_PATH,
  SPACES_BOOT_TIMEOUT_SECONDS,
  spacesBootEnv,
} from "./boot";

describe("how a spaces sandbox starts its runner", () => {
  test("runs the runner as a process, since a sandbox there has no service manager", () => {
    expect(SPACES_BOOT_COMMAND).not.toContain("systemctl");
    expect(SPACES_BOOT_COMMAND).toContain("aven runner run");
    expect(SPACES_BOOT_COMMAND).toContain("apt-get install");
    expect(SPACES_BOOT_COMMAND).toContain("sha256sum -c");
    expect(SPACES_BOOT_COMMAND).toContain(SPACES_BOOT_PATH);
  });

  test("takes root through sudo for the install when the sandbox runs as a plain user", () => {
    expect(SPACES_BOOT_COMMAND).toContain('sudo -n "$@"');
    expect(SPACES_BOOT_COMMAND).toContain("as_root install -m 755");
    expect(SPACES_BOOT_COMMAND).toContain("as_root apt-get install");
  });

  test("is wrapped in single quotes and holds none of its own", () => {
    const wrapped = SPACES_BOOT_COMMAND.slice(SPACES_BOOT_COMMAND.indexOf("bash -lc ") + 9);

    expect(wrapped.startsWith("'")).toBe(true);
    expect(wrapped.endsWith("'")).toBe(true);
    expect(wrapped.slice(1, -1)).not.toContain("'");
  });

  test("never carries the runner token, which travels in the env file", () => {
    expect(SPACES_BOOT_COMMAND).not.toContain("avrt_");
    expect(spacesBootEnv("https://aven.example.com/api", "avrt_secret")).toBe(
      "AVEN_URL=https://aven.example.com/api\nAVEN_RUNTIME_TOKEN=avrt_secret\nAVEN_DIRS=/home/user\n",
    );
  });

  test("refuses an address or token that would break the env file", () => {
    expect(() => spacesBootEnv("https://a b", "avrt_x")).toThrow("not usable");
    expect(() => spacesBootEnv("https://a", "avrt_x\nAVEN_URL=evil")).toThrow("not usable");
  });

  test("allows long enough for the packages and the binary to download", () => {
    expect(SPACES_BOOT_TIMEOUT_SECONDS).toBe(600);
  });
});
