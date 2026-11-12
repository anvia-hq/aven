import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_BINARIES } from "./claude-binary-manifest";
import { claudeExecutable } from "./claude-binary";
import type { ClaudeBinaryEntry } from "./types";

let scratch = "";
let tarball = Buffer.alloc(0);
let entry: ClaudeBinaryEntry;

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), "aven-claude-binary-"));
  const pack = join(scratch, "pack");
  await mkdir(join(pack, "package"), { recursive: true });
  writeFileSync(join(pack, "package", "claude"), "#!/bin/sh\necho claude-test\n");
  const archive = join(scratch, "claude.tgz");
  const child = Bun.spawn(["tar", "-czf", archive, "-C", pack, "package"]);
  await child.exited;
  tarball = readFileSync(archive);
  entry = {
    package: "@anthropic-ai/claude-agent-sdk-linux-x64",
    version: "9.9.9",
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  };
});

afterAll(() => rm(scratch, { recursive: true, force: true }));

function served(body: Buffer, status = 200) {
  const urls: string[] = [];
  const fetchTarball = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(status === 200 ? new Uint8Array(body) : null, { status });
  }) as typeof fetch;
  return { urls, fetchTarball };
}

const options = (dir: string, extra: object = {}) => ({
  dir,
  platform: "linux",
  arch: "x64",
  musl: false,
  manifest: { "linux-x64": entry },
  bundled: () => undefined,
  ...extra,
});

describe("claudeExecutable", () => {
  test("downloads the platform's package once, checks it, and reuses the file", async () => {
    const dir = join(scratch, "once");
    const { urls, fetchTarball } = served(tarball);
    const first = await claudeExecutable(options(dir, { fetchTarball }));
    const second = await claudeExecutable(options(dir, { fetchTarball }));
    expect(first).toBe(join(dir, "9.9.9", "claude"));
    expect(second).toBe(first);
    expect(urls).toEqual([
      "https://registry.npmjs.org/@anthropic-ai/claude-agent-sdk-linux-x64/-/claude-agent-sdk-linux-x64-9.9.9.tgz",
    ]);
    expect(readFileSync(first, "utf8")).toContain("claude-test");
    expect((await Bun.file(first).stat()).mode & 0o111).not.toBe(0);
    expect(await readdir(join(dir, "9.9.9"))).toEqual(["claude"]);
  });

  test("two runs at once share one download", async () => {
    const dir = join(scratch, "shared");
    const { urls, fetchTarball } = served(tarball);
    const [a, b] = await Promise.all([
      claudeExecutable(options(dir, { fetchTarball })),
      claudeExecutable(options(dir, { fetchTarball })),
    ]);
    expect(a).toBe(b);
    expect(urls).toHaveLength(1);
  });

  test("a file that does not match the expected checksum is refused and not kept", async () => {
    const dir = join(scratch, "tampered");
    const { fetchTarball } = served(Buffer.from("not the package"));
    await expect(claudeExecutable(options(dir, { fetchTarball }))).rejects.toThrow(
      "does not match",
    );
    expect(existsSync(join(dir, "9.9.9", "claude"))).toBe(false);
    expect(await readdir(join(dir, "9.9.9"))).toEqual([]);
  });

  test("a failed download says so", async () => {
    const dir = join(scratch, "down");
    const { fetchTarball } = served(tarball, 503);
    await expect(claudeExecutable(options(dir, { fetchTarball }))).rejects.toThrow("503");
  });

  test("a binary installed beside the SDK is used without downloading", async () => {
    const { urls, fetchTarball } = served(tarball);
    const found = await claudeExecutable(
      options(join(scratch, "bundled"), { fetchTarball, bundled: () => "/modules/claude" }),
    );
    expect(found).toBe("/modules/claude");
    expect(urls).toEqual([]);
  });

  test("an older download is removed once the current one is in place", async () => {
    const dir = join(scratch, "prune");
    await mkdir(join(dir, "0.0.1"), { recursive: true });
    writeFileSync(join(dir, "0.0.1", "claude"), "old");
    const { fetchTarball } = served(tarball);
    await claudeExecutable(options(dir, { fetchTarball }));
    expect(await readdir(dir)).toEqual(["9.9.9"]);
  });

  test("a platform without a binary is refused by name", async () => {
    await expect(
      claudeExecutable(options(join(scratch, "other"), { platform: "freebsd", arch: "x64" })),
    ).rejects.toThrow("freebsd-x64");
  });

  test("musl picks the musl package", async () => {
    const dir = join(scratch, "musl");
    const musl = { ...entry, package: "@anthropic-ai/claude-agent-sdk-linux-x64-musl" };
    const { urls, fetchTarball } = served(tarball);
    await claudeExecutable(
      options(dir, { fetchTarball, musl: true, manifest: { "linux-x64-musl": musl } }),
    );
    expect(urls[0]).toContain("claude-agent-sdk-linux-x64-musl-9.9.9.tgz");
  });
});

describe("the manifest", () => {
  test("matches the SDK version and checksums in bun.lock", () => {
    const lock = readFileSync(join(import.meta.dir, "../../../bun.lock"), "utf8");
    const sdk = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../node_modules/@anthropic-ai/claude-agent-sdk/package.json"),
        "utf8",
      ),
    ) as { version: string };

    for (const item of Object.values(CLAUDE_BINARIES)) {
      expect(item.version).toBe(sdk.version);
      const line = lock.split("\n").find((row) => row.trimStart().startsWith(`"${item.package}":`));
      expect(line).toContain(`${item.package}@${item.version}`);
      expect(line).toContain(item.integrity);
    }
  });
});
