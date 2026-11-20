import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { Glob } from "bun";

import type { ShardVerification, TimingsFile } from "./types";

const TEST_GLOB = "**/*.{test,spec}.{ts,tsx,js,jsx,mjs}";
const DEFAULT_ROOTS = ["apps", "packages", "sandbox", "tooling"];

export function discoverTestFiles(cwd: string, roots: readonly string[] = DEFAULT_ROOTS): string[] {
  const found = new Set<string>();
  const glob = new Glob(TEST_GLOB);

  for (const root of roots) {
    const rootDir = resolve(cwd, root);

    if (!existsSync(rootDir)) continue;

    for (const match of glob.scanSync({ cwd: rootDir, onlyFiles: true })) {
      const normalized = relative(cwd, resolve(rootDir, match)).replaceAll("\\", "/");

      if (normalized.includes("/node_modules/") || normalized.includes("/dist/")) continue;

      found.add(normalized);
    }
  }

  return [...found].sort();
}

export function verifyShards(
  discovered: readonly string[],
  shardTimings: readonly TimingsFile[],
  maxFileMs = 20_000,
): ShardVerification {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  const mergedFiles: Record<string, number> = {};

  for (const shard of shardTimings) {
    for (const [rawFile, durationMs] of Object.entries(shard.files)) {
      const file = rawFile.replaceAll("\\", "/");
      const count = (seen.get(file) ?? 0) + 1;
      seen.set(file, count);

      if (count === 2) duplicates.push(file);

      mergedFiles[file] = durationMs;
    }
  }

  const missing = discovered.filter((file) => !seen.has(file));
  const slowFiles = Object.entries(mergedFiles)
    .flatMap(([file, ms]) => (ms > maxFileMs ? [{ file, ms }] : []))
    .sort((a, b) => b.ms - a.ms);

  return {
    discovered: [...discovered],
    merged: { version: 1, files: mergedFiles },
    missing,
    duplicates: duplicates.sort(),
    slowFiles,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  let outPath: string | undefined;
  let maxFileMs = 20_000;
  let enforceSlow = false;
  const inputs: string[] = [];

  for (const arg of args) {
    if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length);
    else if (arg.startsWith("--max-file-ms="))
      maxFileMs = Number(arg.slice("--max-file-ms=".length));
    else if (arg === "--fail-slow") enforceSlow = true;
    else inputs.push(arg);
  }

  if (inputs.length === 0) {
    console.error("Usage: bun tooling/ci/verify-unit-shards.ts [--out=file] <shard-timings...>");
    process.exit(1);
  }

  const shardTimings = inputs.map((path) => JSON.parse(readFileSync(path, "utf8")) as TimingsFile);
  const discovered = discoverTestFiles(process.cwd());
  const result = verifyShards(discovered, shardTimings, maxFileMs);

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(result.merged, null, 2)}\n`);
  }

  console.log(
    `Verified ${Object.keys(result.merged.files).length}/${result.discovered.length} unit test files across ${inputs.length} shards.`,
  );

  if (result.slowFiles.length > 0) {
    console.log(`Files exceeding ${maxFileMs}ms:`);
    for (const item of result.slowFiles) {
      console.log(`  ${(item.ms / 1000).toFixed(2)}s ${item.file}`);
    }
  }

  let failed = false;

  if (result.missing.length > 0) {
    console.error(`Missing ${result.missing.length} test files across shards:`);
    for (const file of result.missing) console.error(`  ${file}`);
    failed = true;
  }

  if (result.duplicates.length > 0) {
    console.error(`Duplicate test files across shards:`);
    for (const file of result.duplicates) console.error(`  ${file}`);
    failed = true;
  }

  if (enforceSlow && result.slowFiles.length > 0) failed = true;

  if (failed) process.exit(1);
}
