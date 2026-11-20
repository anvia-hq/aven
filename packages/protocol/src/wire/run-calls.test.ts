import { describe, expect, test } from "bun:test";

import {
  parseAppendParams,
  parseCockpitReadParams,
  parseCodexAuthParams,
  parseEnvironmentReadParams,
  parseEnvironmentSaveParams,
  parseForkStartParams,
  parseForkStatusParams,
  parseMachineRelayParams,
  parseMcpReportParams,
  parseMemoryNotesParams,
  parseMemoryParams,
  parseSkillsGetParams,
} from "./run-calls";

const UUID = "11111111-2222-4333-8444-555555555555";
const DIGEST = "a".repeat(64);

describe("run call parameter parsers", () => {
  test("parseMemoryParams and parseEnvironmentReadParams require a non-empty runId", () => {
    expect(parseMemoryParams({ runId: "r1" })).toEqual({ runId: "r1" });
    expect(parseEnvironmentReadParams({ runId: "r1" })).toEqual({ runId: "r1" });
    expect(() => parseMemoryParams({ runId: "" })).toThrow("Invalid parameters");
    expect(() => parseEnvironmentReadParams({})).toThrow("Invalid parameters");
  });

  test("parseAppendParams validates turn and message objects", () => {
    expect(parseAppendParams({ runId: "r1", turn: 0, messages: [{ role: "user" }] })).toEqual({
      runId: "r1",
      turn: 0,
      messages: [{ role: "user" } as never],
    });
    expect(() => parseAppendParams({ runId: "r1", turn: -1, messages: [] })).toThrow();
    expect(() => parseAppendParams({ runId: "r1", turn: 1.5, messages: [] })).toThrow();
    expect(() => parseAppendParams({ runId: "r1", turn: 0, messages: [null] })).toThrow();
  });

  test("parseMemoryNotesParams validates every memory command variant", () => {
    const commands = [
      { command: "view", path: "/memories/a.md", viewRange: [1, 5] },
      { command: "create", path: "/memories/a.md", fileText: "hello" },
      { command: "str_replace", path: "/memories/a.md", oldStr: "a", newStr: "b" },
      { command: "insert", path: "/memories/a.md", insertLine: 2, insertText: "line" },
      { command: "delete", path: "/memories/a.md" },
      { command: "rename", oldPath: "/memories/a.md", newPath: "/memories/b.md" },
    ];
    for (const command of commands) {
      expect(parseMemoryNotesParams({ runId: "r1", command })).toEqual({
        runId: "r1",
        command: command as never,
      });
    }
    expect(() =>
      parseMemoryNotesParams({ runId: "r1", command: { command: "unknown", path: "/a" } }),
    ).toThrow();
    expect(() =>
      parseMemoryNotesParams({
        runId: "r1",
        command: { command: "insert", path: "/a", insertLine: 1.5, insertText: "x" },
      }),
    ).toThrow();
  });

  test("parseCockpitReadParams requires runId and accepts arbitrary command payloads", () => {
    expect(parseCockpitReadParams({ runId: "r1", command: { command: "tags" } })).toEqual({
      runId: "r1",
      command: { command: "tags" },
    });
    expect(() => parseCockpitReadParams({ runId: "", command: {} })).toThrow();
  });

  test("parseForkStartParams and parseForkStatusParams validate text, title, and uuid", () => {
    expect(
      parseForkStartParams({
        runId: "r1",
        task: " Fix bug ",
        context: " In auth ",
        title: " Auth fix ",
      }),
    ).toEqual({
      runId: "r1",
      task: "Fix bug",
      context: "In auth",
      title: "Auth fix",
    });
    expect(() => parseForkStartParams({ runId: "r1", task: " ", context: "ok" })).toThrow();

    expect(parseForkStatusParams({ runId: "r1", id: UUID, stop: true })).toEqual({
      runId: "r1",
      id: UUID,
      stop: true,
    });
    expect(() => parseForkStatusParams({ runId: "r1", id: "not-a-uuid" })).toThrow();
  });

  test("parseMachineRelayParams names a run or a bot reply, and nothing else", () => {
    expect(parseMachineRelayParams({ runId: "r1", threadId: "other", op: "workspace" })).toEqual({
      runId: "r1",
      op: "workspace",
    });
    expect(parseMachineRelayParams({ runId: "r1", op: "exec", args: { command: "pwd" } })).toEqual({
      runId: "r1",
      op: "exec",
      args: { command: "pwd" },
    });
    expect(parseMachineRelayParams({ replyId: "reply-1", op: "paths" })).toEqual({
      replyId: "reply-1",
      op: "paths",
    });
    expect(() => parseMachineRelayParams({ op: "exec" })).toThrow("Invalid parameters");
    expect(() => parseMachineRelayParams({ replyId: "reply-1", op: "rm" })).toThrow(
      "Invalid parameters",
    );
  });

  test("parseSkillsGetParams and parseEnvironmentSaveParams validate 64-hex digests", () => {
    expect(parseSkillsGetParams({ runId: "r1", digest: DIGEST })).toEqual({
      runId: "r1",
      digest: DIGEST,
    });
    expect(parseEnvironmentSaveParams({ runId: "r1", setupDigest: DIGEST })).toEqual({
      runId: "r1",
      setupDigest: DIGEST,
    });
    expect(() => parseSkillsGetParams({ runId: "r1", digest: "Z".repeat(64) })).toThrow();
    expect(() => parseEnvironmentSaveParams({ runId: "r1", setupDigest: "abc" })).toThrow();
  });

  test("parseMcpReportParams validates results array", () => {
    expect(
      parseMcpReportParams({
        runId: "r1",
        results: [{ id: UUID }, { id: UUID, error: " failed " }],
      }),
    ).toEqual({
      runId: "r1",
      results: [{ id: UUID }, { id: UUID, error: "failed" }],
    });
    expect(() => parseMcpReportParams({ runId: "r1", results: [{ id: "bad" }] })).toThrow();
  });

  test("parseCodexAuthParams enforces previous and token lengths", () => {
    const token = "x".repeat(20);
    expect(parseCodexAuthParams({ previous: "old", token })).toEqual({ previous: "old", token });
    expect(() => parseCodexAuthParams({ previous: "", token })).toThrow();
    expect(() => parseCodexAuthParams({ previous: "old", token: "short" })).toThrow();
  });
});
