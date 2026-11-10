import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { codexConfig, codexEnvironment, runCodexTurn } from "./codex-engine";
import type { CodexTurn } from "./types";
import type { RunEvent } from "@aven/protocol/types";

const dir = mkdtempSync(join(tmpdir(), "fake-codex-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fake = join(import.meta.dir, "testing", "fake-codex.ts");

const turnOf = (lines: unknown[], changes: Partial<CodexTurn> = {}) => {
  const folder = mkdtempSync(join(dir, "turn-"));
  writeFileSync(join(folder, "script.json"), JSON.stringify(lines));
  const turn: CodexTurn = {
    codexPath: fake,
    input: "fix the bug",
    workingDirectory: folder,
    env: { PATH: process.env.PATH },
    ...changes,
  };
  const calls = () =>
    readFileSync(join(folder, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            args: string[];
            input: string;
            env: Record<string, string | undefined>;
          },
      );
  return { turn, calls };
};

const run = async (turn: CodexTurn) => {
  const events: RunEvent[] = [];
  const end = await runCodexTurn(turn, (event) => events.push(event));
  return { events, end };
};

const finished = [
  { type: "thread.started", thread_id: "th_1" },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "m", type: "agent_message", text: "Fixed." } },
  {
    type: "turn.completed",
    usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 },
  },
];

describe("runCodexTurn", () => {
  test("a turn's events reach the run as Aven's events, and the thread id comes back", async () => {
    const { turn } = turnOf(finished);
    const { events, end } = await run(turn);
    expect(events.map((event) => event.type)).toEqual(["text", "usage"]);
    expect(end).toEqual({ threadId: "th_1", ended: "done", error: undefined });
  });

  test("the prompt goes in on stdin, with the model, the read-only sandbox and no approvals", async () => {
    const { turn, calls } = turnOf(finished, { model: "gpt-5", effort: "high" });
    await run(turn);
    const [call] = calls();
    expect(call!.input).toBe("fix the bug");
    expect(call!.args.slice(0, 2)).toEqual(["exec", "--experimental-json"]);
    expect(call!.args).toContain("--model");
    expect(call!.args).toContain("gpt-5");
    expect(call!.args.join(" ")).toContain("--sandbox read-only");
    expect(call!.args.join(" ")).toContain('approval_policy="never"');
    expect(call!.args.join(" ")).toContain('model_reasoning_effort="high"');
    expect(call!.args.join(" ")).toContain('web_search="disabled"');
  });

  test("Codex's own shell is switched off, so a command can only run through Aven's tools", async () => {
    const { turn, calls } = turnOf(finished);
    await run(turn);
    const args = calls()[0]!.args.join(" ");
    expect(args).toContain("features.shell_tool=false");
    expect(args).toContain("features.unified_exec=false");
  });

  test("Aven's tools are an MCP server whose token is read from the environment, not given on the command line", async () => {
    const { turn, calls } = turnOf(finished, {
      mcp: { url: "http://127.0.0.1:9999/mcp", token: "run-token" },
    });
    await run(turn);
    const [call] = calls();
    const args = call!.args.join(" ");
    expect(args).toContain('mcp_servers.aven.url="http://127.0.0.1:9999/mcp"');
    expect(args).toContain('mcp_servers.aven.bearer_token_env_var="AVEN_MCP_TOKEN"');
    expect(args).not.toContain("run-token");
    expect(call!.env.AVEN_MCP_TOKEN).toBe("run-token");
  });

  test("only the runner's login location and the basics reach Codex, no other credential", async () => {
    const { turn, calls } = turnOf(finished, {
      env: {
        PATH: process.env.PATH,
        HOME: "/home/person",
        OPENAI_API_KEY: "sk-other",
        CODEX_API_KEY: "sk-codex",
        SECRET: "hunter2",
      },
    });
    await run(turn);
    const [call] = calls();
    expect(call!.env.HOME).toBe("/home/person");
    expect(call!.env.OPENAI_API_KEY).toBeUndefined();
    expect(call!.env.CODEX_API_KEY).toBeUndefined();
    expect(call!.env.SECRET).toBeUndefined();
  });

  test("a later turn resumes the thread it was given", async () => {
    const { turn, calls } = turnOf(finished, { threadId: "th_0" });
    await run(turn);
    const args = calls()[0]!.args;
    expect(args.slice(-2)).toEqual(["resume", "th_0"]);
  });

  test("a failed turn is an error, once", async () => {
    const { turn } = turnOf([
      { type: "thread.started", thread_id: "th_1" },
      { type: "turn.failed", error: { message: "usage limit reached" } },
    ]);
    const { events, end } = await run(turn);
    expect(events).toEqual([{ type: "error", message: "usage limit reached" }]);
    expect(end).toMatchObject({ ended: "error", error: "usage limit reached", threadId: "th_1" });
  });

  test("a Codex that exits with a failure is an error with what it said", async () => {
    const { turn } = turnOf(["exit-1"]);
    const { events, end } = await run(turn);
    expect(end.ended).toBe("error");
    expect(events.at(-1)).toMatchObject({ type: "error" });
  });

  test("a turn that is cancelled ends as cancelled and says no error", async () => {
    const { turn } = turnOf([{ type: "thread.started", thread_id: "th_9" }, "hang"]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const { events, end } = await run({ ...turn, signal: controller.signal });
    expect(end).toEqual({ threadId: "th_9", ended: "cancelled" });
    expect(events.filter((event) => event.type === "error")).toEqual([]);
  });
});

describe("what a turn is given", () => {
  test("the environment keeps the basics and adds the run's token", () => {
    expect(codexEnvironment({ PATH: "/bin", HOME: "/h", AWS_SECRET_ACCESS_KEY: "x" }, "t")).toEqual(
      { PATH: "/bin", HOME: "/h", AVEN_MCP_TOKEN: "t" },
    );
  });

  test("with no tools server there is no MCP entry", () => {
    expect(codexConfig()).toEqual({ features: { shell_tool: false, unified_exec: false } });
  });
});
