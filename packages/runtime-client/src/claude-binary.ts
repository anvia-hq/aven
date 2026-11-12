import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, readdir, rename, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { once } from "node:events";
import { finished } from "node:stream/promises";

import { CLAUDE_BINARIES } from "./claude-binary-manifest";
import type { ClaudeBinaryEntry, ClaudeBinaryOptions } from "./types";

const REGISTRY = "https://registry.npmjs.org";

const inflight = new Map<string, Promise<string>>();

function isMusl(platform: string, arch: string) {
  if (platform !== "linux") return false;

  const loader = arch === "arm64" ? "aarch64" : "x86_64";
  return existsSync(`/lib/ld-musl-${loader}.so.1`);
}

export function bundledClaude(entry: ClaudeBinaryEntry) {
  try {
    const require = createRequire(import.meta.url);
    const found = join(dirname(require.resolve(`${entry.package}/package.json`)), "claude");
    return existsSync(found) ? found : undefined;
  } catch {
    return undefined;
  }
}

function tarballUrl(registry: string, entry: ClaudeBinaryEntry) {
  const name = entry.package.split("/")[1] ?? entry.package;
  return `${registry}/${entry.package}/-/${name}-${entry.version}.tgz`;
}

async function untar(archive: string, into: string) {
  const child = Bun.spawn(["tar", "-xzf", archive, "-C", into, "package/claude"], {
    stdout: "ignore",
    stderr: "pipe",
  });
  const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  if (code !== 0) throw new Error(`Could not unpack the Claude binary: ${error.trim()}`);
}

async function download(entry: ClaudeBinaryEntry, target: string, options: ClaudeBinaryOptions) {
  const fetcher = options.fetchTarball ?? fetch;
  const work = `${target}.part-${process.pid}-${Date.now()}`;
  const archive = join(work, "claude.tgz");
  await mkdir(work, { recursive: true });
  try {
    const response = await fetcher(tarballUrl(options.registry ?? REGISTRY, entry));

    if (!response.ok || !response.body) {
      throw new Error(`Could not download the Claude binary: ${response.status}`);
    }

    const hash = createHash("sha512");
    const out = createWriteStream(archive);
    let failure: Error | undefined;
    out.on("error", (error) => {
      failure = error;
    });
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        if (failure) throw failure;

        hash.update(chunk);

        if (!out.write(chunk)) await once(out, "drain");
      }
      out.end();
      await finished(out);

      if (failure) throw failure;
    } finally {
      out.destroy();
    }

    if (`sha512-${hash.digest("base64")}` !== entry.integrity) {
      throw new Error("The downloaded Claude binary does not match the version Aven expects");
    }

    await untar(archive, work);
    const unpacked = join(work, "package", "claude");
    await chmod(unpacked, 0o755);
    await mkdir(dirname(target), { recursive: true });
    await rename(unpacked, target);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function pruneOthers(dir: string, keep: string) {
  for (const name of await readdir(dir).catch(() => [])) {
    if (name !== keep) await rm(join(dir, name), { recursive: true, force: true });
  }
}

export async function claudeExecutable(options: ClaudeBinaryOptions): Promise<string> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const musl = options.musl ?? isMusl(platform, arch);
  const key = `${platform}-${arch}${musl ? "-musl" : ""}`;
  const entry = (options.manifest ?? CLAUDE_BINARIES)[key];

  if (!entry) throw new Error(`Claude threads cannot run on ${key} yet`);

  const bundled = (options.bundled ?? bundledClaude)(entry);

  if (bundled) return bundled;

  const target = join(options.dir, entry.version, "claude");

  if (existsSync(target)) return target;

  const running = inflight.get(target);

  if (running) return running;

  const started = download(entry, target, options)
    .then(() => pruneOthers(options.dir, entry.version))
    .then(() => target)
    .finally(() => inflight.delete(target));
  inflight.set(target, started);
  return started;
}
