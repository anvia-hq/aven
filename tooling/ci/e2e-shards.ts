import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { Glob } from "bun";

import type {
  PlaywrightJsonReport,
  PlaywrightJsonSuite,
  ShardVerification,
  TimingsFile,
} from "./types";
import { verifyShards } from "./verify-unit-shards";

const DEFAULT_E2E_FILE_MS = 10_000;

export function discoverE2eSpecs(cwd: string): string[] {
  const e2eDir = resolve(cwd, "e2e");

  if (!existsSync(e2eDir)) return [];

  const found: string[] = [];
  const glob = new Glob("**/*.spec.ts");

  for (const match of glob.scanSync({ cwd: e2eDir, onlyFiles: true })) {
    found.push(relative(cwd, resolve(e2eDir, match)).replaceAll("\\", "/"));
  }

  return found.sort();
}

export function balanceShards(
  files: readonly string[],
  shardCount: number,
  timings: Record<string, number> = {},
): string[][] {
  if (shardCount < 1) throw new Error(`Invalid shardCount: ${shardCount}`);

  const sorted = [...files].sort((a, b) => {
    const diff = (timings[b] ?? DEFAULT_E2E_FILE_MS) - (timings[a] ?? DEFAULT_E2E_FILE_MS);
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  const buckets: string[][] = Array.from({ length: shardCount }, () => []);
  const totals: number[] = Array.from({ length: shardCount }, () => 0);

  for (const file of sorted) {
    let best = 0;
    for (let i = 1; i < shardCount; i++) {
      if (totals[i]! < totals[best]!) best = i;
    }
    buckets[best]!.push(file);
    totals[best] = totals[best]! + (timings[file] ?? DEFAULT_E2E_FILE_MS);
  }

  return buckets.map((bucket) => bucket.sort());
}

export function extractPlaywrightTimings(report: PlaywrightJsonReport): TimingsFile {
  const files: Record<string, number> = {};

  const walk = (suite: PlaywrightJsonSuite, inheritedFile?: string) => {
    const suiteFile = suite.file ?? inheritedFile;

    for (const spec of suite.specs ?? []) {
      const rawFile = spec.file ?? suiteFile;

      if (!rawFile) continue;

      const normalized = rawFile.startsWith("e2e/") ? rawFile : `e2e/${rawFile}`;
      let sum = 0;

      for (const testItem of spec.tests ?? []) {
        for (const result of testItem.results ?? []) {
          sum += result.duration ?? 0;
        }
      }

      files[normalized] = (files[normalized] ?? 0) + sum;
    }

    for (const child of suite.suites ?? []) {
      walk(child, suiteFile);
    }
  };

  for (const suite of report.suites ?? []) {
    walk(suite);
  }

  return { version: 1, files };
}

export function verifyE2eReports(
  discovered: readonly string[],
  reports: readonly PlaywrightJsonReport[],
): ShardVerification {
  const shardTimings = reports.map(extractPlaywrightTimings);
  return verifyShards(discovered, shardTimings, 120_000);
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "plan") {
    let shardArg = "1/1";
    let timingsPath: string | undefined;
    let filesArg: string | undefined;

    for (const arg of rest) {
      if (arg.startsWith("--shard=")) shardArg = arg.slice("--shard=".length);
      else if (arg.startsWith("--timings=")) timingsPath = arg.slice("--timings=".length);
      else if (arg.startsWith("--files=")) filesArg = arg.slice("--files=".length);
    }

    const [indexStr, countStr] = shardArg.split("/");
    const shardIndex = Number(indexStr);
    const shardCount = Number(countStr);

    if (
      !Number.isInteger(shardIndex) ||
      !Number.isInteger(shardCount) ||
      shardIndex < 1 ||
      shardIndex > shardCount
    ) {
      console.error(`Invalid --shard value: ${shardArg}`);
      process.exit(1);
    }

    const timings =
      timingsPath && existsSync(timingsPath)
        ? (JSON.parse(readFileSync(timingsPath, "utf8")) as TimingsFile).files
        : {};
    const specs =
      filesArg !== undefined
        ? filesArg.split(",").flatMap((item) => {
            const trimmed = item.trim();
            return trimmed ? [trimmed] : [];
          })
        : discoverE2eSpecs(process.cwd());

    const planned = balanceShards(specs, shardCount, timings)[shardIndex - 1] ?? [];
    for (const spec of planned) console.log(spec);
  } else if (command === "verify") {
    let outPath: string | undefined;
    const inputs: string[] = [];

    for (const arg of rest) {
      if (arg.startsWith("--out=")) outPath = arg.slice("--out=".length);
      else inputs.push(arg);
    }

    if (inputs.length === 0) {
      console.error("Usage: bun tooling/ci/e2e-shards.ts verify [--out=file] <reports...>");
      process.exit(1);
    }

    const reports = inputs.map(
      (path) => JSON.parse(readFileSync(path, "utf8")) as PlaywrightJsonReport,
    );
    const discovered = discoverE2eSpecs(process.cwd());
    const result = verifyE2eReports(discovered, reports);

    if (outPath) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(result.merged, null, 2)}\n`);
    }

    console.log(
      `Verified ${Object.keys(result.merged.files).length}/${result.discovered.length} e2e spec files across ${inputs.length} shards.`,
    );

    let failed = false;

    if (result.missing.length > 0) {
      console.error(`Missing ${result.missing.length} e2e spec files across shards:`);
      for (const file of result.missing) console.error(`  ${file}`);
      failed = true;
    }

    if (result.duplicates.length > 0) {
      console.error("Duplicate e2e spec files across shards:");
      for (const file of result.duplicates) console.error(`  ${file}`);
      failed = true;
    }

    if (failed) process.exit(1);
  } else {
    console.error("Usage: bun tooling/ci/e2e-shards.ts <plan|verify> ...");
    process.exit(1);
  }
}
