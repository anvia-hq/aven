import { describe, expect, test } from "bun:test";

import { mergedRuns } from "./merged-runs";
import type { ChatMessage } from "./types";

const said = (id: string, role: ChatMessage["role"], text: string, workedMs?: number) =>
  ({ id, role, parts: [{ type: "text", text }], workedMs }) as ChatMessage;
const note = (id: string) =>
  said(id, "user", "[process] Process abc (bun test) ended with exit code 0 after 12s.");

describe("answers a background task's end woke the agent for", () => {
  test("follow the answer before them as one, with the times added up", () => {
    const merged = mergedRuns(
      [
        said("u", "user", "review the PRs"),
        said("a1", "assistant", "waiting", 893_000),
        note("n1"),
        said("a2", "assistant", "still running", 82_000),
        note("n2"),
        said("a3", "assistant", "done", 35_000),
      ],
      false,
    );
    expect(merged.map((message) => message.id)).toEqual(["u", "a1"]);
    expect(merged[1]?.workedMs).toBe(1_010_000);
    expect(merged[1]?.parts.map((part) => (part.type === "text" ? part.text : ""))).toEqual([
      "waiting",
      "still running",
      "done",
    ]);
  });

  test("are kept apart when a person wrote in between", () => {
    const messages = [
      said("a1", "assistant", "one", 1000),
      said("u", "user", "and now?"),
      said("a2", "assistant", "two", 2000),
    ];
    expect(mergedRuns(messages, false)).toEqual(messages);
  });

  test("are kept apart while the run is still going, so it can be read as it comes", () => {
    const messages = [
      said("a1", "assistant", "waiting", 1000),
      note("n1"),
      said("a2", "assistant", "working"),
    ];
    expect(mergedRuns(messages, true).map((message) => message.id)).toEqual(["a1", "n1", "a2"]);
  });

  test("keep an unknown time unknown", () => {
    const merged = mergedRuns(
      [said("a1", "assistant", "x"), note("n1"), said("a2", "assistant", "y")],
      false,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.workedMs).toBeUndefined();
  });
});
