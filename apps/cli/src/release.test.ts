import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { exec } from "./compose";
import {
  assetName,
  downloadVerified,
  installBinary,
  latestVersion,
  parseChecksums,
  platformName,
} from "./release";

describe("platformName", () => {
  test("names the four builds and refuses the rest", () => {
    expect(platformName("darwin", "arm64")).toBe("darwin-arm64");
    expect(platformName("darwin", "x64")).toBe("darwin-amd64");
    expect(platformName("linux", "x64")).toBe("linux-amd64");
    expect(platformName("linux", "arm64")).toBe("linux-arm64");
    expect(() => platformName("win32", "x64")).toThrow("no aven build");
    expect(() => platformName("linux", "ia32")).toThrow("no aven build");
  });
});

describe("latestVersion", () => {
  const redirect = (location: string | null) =>
    (async () =>
      new Response(null, {
        status: 302,
        headers: location ? { location } : {},
      })) as unknown as typeof fetch;

  test("reads the tag GitHub redirects /releases/latest to", async () => {
    expect(
      await latestVersion(redirect("https://github.com/anvia-hq/aven/releases/tag/v0.3.1")),
    ).toBe("0.3.1");
  });

  test("fails when there is no release to redirect to", async () => {
    await expect(latestVersion(redirect(null))).rejects.toThrow(
      "Could not find the latest release",
    );
  });
});

test("parseChecksums reads sha256sum's two formats", () => {
  const a = "a".repeat(64);
  const b = "b".repeat(64);
  expect(parseChecksums(`${a}  one.tar.gz\n${b} *two.tar.gz\nnot a line\n`)).toEqual({
    "one.tar.gz": a,
    "two.tar.gz": b,
  });
});

describe("downloadVerified", () => {
  const archive = new TextEncoder().encode("the archive");
  const hash = new Bun.CryptoHasher("sha256").update(archive).digest("hex");
  const serve = (checksum: string) =>
    (async (url: string) => {
      if (url.endsWith("checksums.txt"))
        return new Response(`${checksum}  ${assetName("1.0.0", "linux-amd64")}\n`);
      if (url.endsWith(".tar.gz")) return new Response(archive);
      return new Response("", { status: 404 });
    }) as unknown as typeof fetch;

  test("returns an archive that matches its checksum", async () => {
    expect(await downloadVerified("1.0.0", "linux-amd64", serve(hash))).toEqual(archive);
  });

  test("refuses one that does not", async () => {
    await expect(downloadVerified("1.0.0", "linux-amd64", serve("0".repeat(64)))).rejects.toThrow(
      "does not match its checksum",
    );
  });

  test("says when the release is missing", async () => {
    await expect(
      downloadVerified(
        "9.9.9",
        "linux-amd64",
        (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
      ),
    ).rejects.toThrow("Does release v9.9.9 exist");
  });
});

describe("installBinary", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aven-install-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test("swaps in the program from the archive, executable, and leaves nothing behind", async () => {
    await writeFile(join(dir, "pack-aven"), "#!/bin/sh\necho new\n");
    await exec(["mv", join(dir, "pack-aven"), join(dir, "aven")]);
    await exec(["tar", "-czf", join(dir, "a.tar.gz"), "-C", dir, "aven"]);
    const archive = new Uint8Array(await readFile(join(dir, "a.tar.gz")));

    const target = join(dir, "bin-aven");
    await writeFile(target, "old");
    await installBinary(archive, target);
    expect(await readFile(target, "utf8")).toBe("#!/bin/sh\necho new\n");
    expect((await stat(target)).mode & 0o111).not.toBe(0);
    expect((await exec(["ls", "-A", dir])).out).not.toContain(".aven-update-");
  });
});
