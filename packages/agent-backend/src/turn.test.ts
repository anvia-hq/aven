import { messagesToChat } from "@aven/agents/projection";
import { questionAnswers } from "@aven/protocol/events";
import { describe, expect, test } from "bun:test";

import { STEER_NOTE } from "./hosted-helpers";
import { TurnRecorder } from "./turn";

const SECRET = "sk-turn-secret-9999";
const redact = (text: string) => text.replaceAll(SECRET, "[redacted]");

describe("TurnRecorder", () => {
  test("projects spawn_agent subagents and edit diffs on live tool_start", () => {
    const turn = new TurnRecorder({ provider: "anthropic", modelId: "claude", redact });
    const spawn = turn.beginTool("call-1", "spawn_agent", {
      tasks: [{ description: "inspect auth", prompt: "check login", type: "explore" }],
    });
    expect(spawn).toEqual([
      {
        type: "tool_start",
        tool: {
          id: "call-1",
          name: "spawn_agent",
          target: "1 task",
          status: "running",
          subagents: [
            {
              index: 0,
              description: "inspect auth",
              type: "explore",
              status: "running",
              tools: [],
            },
          ],
        },
      },
    ]);

    const edit = turn.beginTool("call-2", "edit", {
      path: "src/a.ts",
      oldString: "const a = 1;",
      newString: "const a = 2;",
    });
    expect(edit[0]).toMatchObject({
      type: "tool_start",
      tool: {
        id: "call-2",
        name: "edit",
        target: "src/a.ts",
        diff: [
          { type: "del", text: "const a = 1;" },
          { type: "add", text: "const a = 2;" },
        ],
      },
    });
  });

  test("persists show_artifact and spawn_agent results as JSON so transcript reload preserves them", () => {
    const turn = new TurnRecorder({ provider: "openai", modelId: "gpt-6-astra", redact });
    turn.beginTool("a1", "show_artifact", { path: "chart.png" });
    const ended = turn.finishTool(
      "a1",
      JSON.stringify({
        artifacts: [{ name: "chart.png", mediaType: "image/png", caption: `plot ${SECRET}` }],
      }),
      false,
    );
    expect(ended[0]).toMatchObject({
      type: "tool_end",
      id: "a1",
      status: "done",
      artifacts: [{ name: "chart.png", mediaType: "image/png", caption: "plot [redacted]" }],
    });

    turn.beginTool("s1", "spawn_agent", {
      tasks: [{ description: "inspect", prompt: "look", type: "explore" }],
    });
    turn.finishTool(
      "s1",
      JSON.stringify({ results: [{ status: "done", output: `found ${SECRET}` }] }),
      false,
    );

    const chat = messagesToChat(turn.messages("show me"));
    const assistant = chat.find((message) => message.role === "assistant");
    expect(assistant?.parts).toEqual([
      {
        type: "tool",
        tool: {
          id: "a1",
          name: "show_artifact",
          target: "",
          status: "done",
          output: "Showed 1",
          artifacts: [{ name: "chart.png", mediaType: "image/png", caption: "plot [redacted]" }],
        },
      },
      {
        type: "tool",
        tool: {
          id: "s1",
          name: "spawn_agent",
          target: "1 task",
          status: "done",
          output: "1 finished",
          subagents: [
            {
              index: 0,
              description: "inspect",
              type: "explore",
              status: "done",
              tools: [],
              output: "found [redacted]",
            },
          ],
        },
      },
    ]);
  });

  test("redacts secrets in setError", () => {
    const turn = new TurnRecorder({ provider: "anthropic", modelId: "claude", redact });
    turn.setError(`token ${SECRET} rejected`);
    expect(turn.error).toBe("token [redacted] rejected");
  });

  test("projects ask_user answers and sandbox JSON outputs cleanly live and on reload", () => {
    const turn = new TurnRecorder({ provider: "anthropic", modelId: "claude", redact });
    turn.beginTool("q1", "ask_user", {
      questions: [
        { id: "reason", text: "What put you off?" },
        { id: "next", text: "What next?" },
      ],
    });
    const questionEnd = turn.finishTool(
      "q1",
      JSON.stringify({
        answers: [
          { questionId: "reason", value: "Too many borders" },
          { questionId: "next", value: "Flatten the layout" },
        ],
      }),
      false,
    );
    expect(questionEnd[0]).toEqual({
      type: "tool_end",
      id: "q1",
      status: "done",
      output: JSON.stringify({
        answers: [
          { questionId: "reason", value: "Too many borders" },
          { questionId: "next", value: "Flatten the layout" },
        ],
      }),
    });

    turn.beginTool("c1", "exec_command", { command: "bun test" });
    const commandEnd = turn.finishTool(
      "c1",
      `${JSON.stringify({ status: "exited", exitCode: 0, stdout: "4 pass", stderr: "" })}\n\n${STEER_NOTE}\n\nkeep going`,
      false,
    );
    expect(commandEnd[0]).toEqual({
      type: "tool_end",
      id: "c1",
      status: "done",
      output: "4 pass",
    });

    turn.beginTool("r1", "read_file", { path: "src/app.ts" });
    const readEnd = turn.finishTool(
      "r1",
      JSON.stringify({ path: "src/app.ts", content: "export const ok = true;" }),
      false,
    );
    expect(readEnd[0]).toEqual({
      type: "tool_end",
      id: "r1",
      status: "done",
      output: "export const ok = true;",
    });

    turn.beginTool("f1", "fork_thread", { task: "audit" });
    const forkEnd = turn.finishTool(
      "f1",
      JSON.stringify({ id: "thread-fork-1", title: "Audit" }),
      false,
    );
    expect(forkEnd[0]).toEqual({
      type: "tool_end",
      id: "f1",
      status: "done",
      output: JSON.stringify({ id: "thread-fork-1", title: "Audit" }),
    });

    const chat = messagesToChat(turn.messages("go"));
    const assistant = chat.find((message) => message.role === "assistant");
    const tools = (assistant?.parts ?? []).flatMap((part) =>
      part.type === "tool" ? [part.tool] : [],
    );
    expect(questionAnswers(tools[0]!)).toEqual([
      { questionId: "reason", value: "Too many borders" },
      { questionId: "next", value: "Flatten the layout" },
    ]);
    expect(tools[1]?.output).toBe("4 pass");
    expect(tools[2]?.output).toBe("export const ok = true;");
    expect(tools[3]?.output).toBe(JSON.stringify({ id: "thread-fork-1", title: "Audit" }));
  });
});
