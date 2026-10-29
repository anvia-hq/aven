import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createCodingAgent } from "./coding-agent";
import { JobRegistry } from "./jobs/job-registry";
import { messagesToChat, projectStreamEvent } from "./projection";
import { applyEvent, type ChatMessage, type RunEvent } from "@aven/protocol/events";
import { scriptedModel, text, toolCall } from "./testing/scripted-model";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aven-proj-"));
  await writeFile(join(root, "a.txt"), "hello\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function run(prompt: string) {
  const { agent } = createCodingAgent({
    jobs: new JobRegistry(),
    root,
    webSearch: false,
    model: scriptedModel([
      [text("Let me look."), toolCall("read", { path: "a.txt" }, "c1")],
      [
        toolCall("edit", { path: "a.txt", oldString: "hello", newString: "bye" }, "c2"),
        toolCall("read", { path: "missing.txt" }, "c3"),
      ],
      [text("All done.")],
    ]),
  });
  const stream = agent.stream({ prompt });
  const events: RunEvent[] = [];
  for await (const event of stream) {
    const projected = projectStreamEvent(event);
    if (projected) events.push(projected);
  }
  return { events, outcome: await stream.result };
}

describe("projection", () => {
  test("projects only text and tool events, in order", async () => {
    const { events } = await run("go");
    expect(events.map((event) => event.type)).toEqual([
      "text",
      "tool_start",
      "tool_end",
      "tool_start",
      "tool_start",
      "tool_end",
      "tool_end",
      "text",
    ]);
  });

  test("tool events carry target, diff and a human-readable output", async () => {
    const { events } = await run("go");
    const starts = events.filter((event) => event.type === "tool_start");
    expect(starts[0]).toMatchObject({ tool: { name: "read", target: "a.txt", status: "running" } });
    expect(starts[1]).toMatchObject({
      tool: {
        name: "edit",
        diff: [
          { type: "del", text: "hello" },
          { type: "add", text: "bye" },
        ],
      },
    });
    const ends = events.filter((event) => event.type === "tool_end");
    expect(ends[0]).toMatchObject({ id: "c1", status: "done" });
    expect((ends[0] as { output: string }).output).toContain("1: hello");
    // A failing tool is reported as an error the model can see, and does not end the run.
    expect(ends.find((end) => end.id === "c3")).toMatchObject({ status: "error" });
  });

  test("applying events rebuilds the same transcript as the stored history", async () => {
    const { events, outcome } = await run("go");
    const live = [{ type: "run_start", prompt: "go" } as const, ...events].reduce<ChatMessage[]>(
      applyEvent,
      [],
    );
    const stored = messagesToChat(outcome.messages);
    expect(live).toHaveLength(2);
    expect(live[1]!.parts.map((part) => part.type)).toEqual([
      "text",
      "tool",
      "tool",
      "tool",
      "text",
    ]);
    expect(stored.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(stored[1]).toEqual({ ...live[1]!, id: stored[1]!.id });
  });
});
