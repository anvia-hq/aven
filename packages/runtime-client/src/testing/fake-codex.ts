#!/usr/bin/env bun
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const args_ = args;
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
async function callTool(name: string, args: unknown) {
  const configured = args_.find((arg) => arg.startsWith("mcp_servers.aven.url="));
  const url = JSON.parse(configured!.slice("mcp_servers.aven.url=".length)) as string;
  const headers = {
    authorization: `Bearer ${process.env.AVEN_MCP_TOKEN}`,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const post = async (body: unknown) => {
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    return response.text();
  };
  await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "fake-codex", version: "0" },
    },
  });
  await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  return post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
}

for (const line of lines) {
  if (typeof line === "object" && line !== null && "call" in line) {
    const { tool, args: toolArgs } = line.call as { tool: string; args: unknown };
    appendFileSync(join(folder, "tool-results.txt"), `${await callTool(tool, toolArgs)}\n`);
    continue;
  }
  if (line === "hang") await new Promise(() => undefined);
  if (line === "exit-1") process.exit(1);
  console.log(JSON.stringify(line));
}
