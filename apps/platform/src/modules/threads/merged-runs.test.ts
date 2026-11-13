import { describe, expect, test } from "bun:test";

import { COMPACTED, NOTHING_TO_COMPACT } from "@aven/protocol/compaction";

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

describe("a compaction", () => {
  const texts = (messages: ChatMessage[]) =>
    messages.map((message) =>
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    );

  test("is one note, without the command and the reply", () => {
    const merged = mergedRuns(
      [
        said("u", "user", "fix it"),
        said("a", "assistant", "done"),
        said("c", "user", "/compact"),
        said("r", "assistant", COMPACTED),
        said("u2", "user", "next"),
      ],
      false,
    );
    expect(merged.map((message) => message.id)).toEqual(["u", "a", "c", "u2"]);
    expect(texts(merged)[2]).toBe("[compaction] Compacted");
  });

  test("says when there was nothing to compact", () => {
    const merged = mergedRuns(
      [said("c", "user", "/compact"), said("r", "assistant", NOTHING_TO_COMPACT)],
      false,
    );
    expect(texts(merged)).toEqual(["[compaction] Nothing to compact"]);
  });

  test("says it is compacting while the run is going, with or without an empty reply", () => {
    const empty = { id: "r", role: "assistant", parts: [] } as ChatMessage;

    expect(texts(mergedRuns([said("c", "user", "/compact")], true))).toEqual([
      "[compaction] Compacting…",
    ]);
    expect(texts(mergedRuns([said("c", "user", "/compact"), empty], true))).toEqual([
      "[compaction] Compacting…",
    ]);
  });

  test("says so when the run ended without a reply", () => {
    expect(texts(mergedRuns([said("c", "user", "/compact")], false))).toEqual([
      "[compaction] Compaction did not finish",
    ]);
  });

  test("keeps a reply that is not the usual one", () => {
    const merged = mergedRuns(
      [said("c", "user", "/compact"), said("r", "assistant", "Context compacted to 12k tokens")],
      false,
    );
    expect(texts(merged)).toEqual(["[compaction] Compacted", "Context compacted to 12k tokens"]);
  });

  test("is not made of a message that only contains the command", () => {
    const merged = mergedRuns([said("u", "user", "what does /compact do?")], false);
    expect(texts(merged)).toEqual(["what does /compact do?"]);
  });
});

describe("a compaction across the page of earlier messages", () => {
  const texts = (messages: ChatMessage[]) =>
    messages.map((message) =>
      message.parts.map((part) => (part.type === "text" ? part.text : "")).join(""),
    );

  test("is one note when its reply is on the next page", () => {
    const request = said("c", "user", "/compact");
    const reply = said("r", "assistant", COMPACTED);
    const next = said("u", "user", "next");

    expect(texts(mergedRuns([request], false, { after: reply }))).toEqual([
      "[compaction] Compacted",
    ]);
    expect(texts(mergedRuns([reply, next], false, { before: request }))).toEqual(["next"]);
  });

  test("keeps an unusual reply on the next page", () => {
    const request = said("c", "user", "/compact");
    const reply = said("r", "assistant", "Context compacted to 12k tokens");

    expect(texts(mergedRuns([reply], false, { before: request }))).toEqual([
      "Context compacted to 12k tokens",
    ]);
  });

  test("says compacting only for the compaction that is running last", () => {
    const merged = mergedRuns(
      [
        said("c1", "user", "/compact"),
        said("u", "user", "go on"),
        said("a", "assistant", "working"),
        said("c2", "user", "/compact"),
      ],
      true,
    );

    expect(texts(merged)).toEqual([
      "[compaction] Compaction did not finish",
      "go on",
      "working",
      "[compaction] Compacting…",
    ]);
  });
});
