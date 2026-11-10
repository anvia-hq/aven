#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const folder = args[args.indexOf("--cd") + 1] ?? ".";
const input = await Bun.stdin.text();
const env: Record<string, string | undefined> = {};
for (const name of [
  "AVEN_MCP_TOKEN",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "CODEX_HOME",
  "HOME",
  "SECRET",
]) {
  env[name] = process.env[name];
}
appendFileSync(join(folder, "calls.jsonl"), `${JSON.stringify({ args, input, env })}\n`);
const scriptPath = join(folder, "script.json");
const lines: unknown[] = existsSync(scriptPath) ? JSON.parse(readFileSync(scriptPath, "utf8")) : [];
for (const line of lines) {
  if (line === "hang") await new Promise(() => undefined);
  if (line === "exit-1") process.exit(1);
  console.log(JSON.stringify(line));
}
