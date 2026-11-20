import { describe, expect, test } from "bun:test";

import {
  actionRunParams,
  artifactsReadParams,
  computerCallParams,
  diffGetParams,
  filesCallParams,
  filesSearchParams,
  foldersCloneParams,
  foldersCommitsParams,
  foldersCreateParams,
  foldersFilesParams,
  foldersListParams,
  foldersReadmeParams,
  machineCallParams,
  processesCallParams,
  processWatchParams,
  runnerUpdateParams,
  sandboxReleaseParams,
  steerParams,
} from "./call-params";

describe("call-params validators", () => {
  test("diffGetParams validates threadId and diff scopes", () => {
    expect(diffGetParams({ threadId: "t1", scope: "all" })).toEqual({
      threadId: "t1",
      scope: "all",
    });
    expect(diffGetParams({ threadId: "t1", scope: "turn" })).toEqual({
      threadId: "t1",
      scope: "turn",
    });
    expect(diffGetParams({ threadId: "t1", scope: "unshipped" })).toEqual({
      threadId: "t1",
      scope: "unshipped",
    });
    expect(() => diffGetParams({ threadId: "t1", scope: "branch" })).toThrow("Invalid parameters");
    expect(() => diffGetParams({ threadId: 123, scope: "all" })).toThrow("Invalid parameters");
    expect(() => diffGetParams(null)).toThrow("Invalid parameters");
  });

  test("filesCallParams requires string threadId and path", () => {
    expect(filesCallParams({ threadId: "t1", path: "src/app.ts" })).toEqual({
      threadId: "t1",
      path: "src/app.ts",
    });
    expect(() => filesCallParams({ threadId: "t1" })).toThrow("Invalid parameters");
    expect(() => filesCallParams({ threadId: "t1", path: 42 })).toThrow("Invalid parameters");
  });

  test("filesSearchParams requires string threadId and query", () => {
    expect(filesSearchParams({ threadId: "t1", query: "needle" })).toEqual({
      threadId: "t1",
      query: "needle",
    });
    expect(() => filesSearchParams({ threadId: "t1" })).toThrow("Invalid parameters");
    expect(() => filesSearchParams({ threadId: null, query: "a" })).toThrow("Invalid parameters");
  });

  test("artifactsReadParams requires string threadId and name", () => {
    expect(artifactsReadParams({ threadId: "t1", name: "chart.png" })).toEqual({
      threadId: "t1",
      name: "chart.png",
    });
    expect(() => artifactsReadParams({ threadId: "t1", name: 7 })).toThrow("Invalid parameters");
    expect(() => artifactsReadParams({})).toThrow("Invalid parameters");
  });

  test("processesCallParams accepts optional string processId", () => {
    expect(processesCallParams({ threadId: "t1" })).toEqual({
      threadId: "t1",
      processId: undefined,
    });
    expect(processesCallParams({ threadId: "t1", processId: "p1" })).toEqual({
      threadId: "t1",
      processId: "p1",
    });
    expect(() => processesCallParams({ threadId: "t1", processId: 1 })).toThrow(
      "Invalid parameters",
    );
    expect(() => processesCallParams({ processId: "p1" })).toThrow("Invalid parameters");
  });

  test("actionRunParams requires non-empty command", () => {
    expect(actionRunParams({ threadId: "t1", command: "bun test" })).toEqual({
      threadId: "t1",
      command: "bun test",
    });
    expect(() => actionRunParams({ threadId: "t1", command: "" })).toThrow("Invalid parameters");
    expect(() => actionRunParams({ threadId: "t1", command: "   \n\t " })).toThrow(
      "Invalid parameters",
    );
    expect(() => actionRunParams({ threadId: 1, command: "ls" })).toThrow("Invalid parameters");
  });

  test("runnerUpdateParams accepts empty or semver release only", () => {
    expect(runnerUpdateParams({})).toEqual({});
    expect(runnerUpdateParams({ release: null })).toEqual({});
    expect(runnerUpdateParams({ release: "1.2.3" })).toEqual({ release: "1.2.3" });
    expect(() => runnerUpdateParams({ release: "v1.2.3" })).toThrow("Invalid parameters");
    expect(() => runnerUpdateParams({ release: "1.2.3-beta" })).toThrow("Invalid parameters");
    expect(() => runnerUpdateParams({ release: "1.2.3; rm -rf /" })).toThrow("Invalid parameters");
    expect(() => runnerUpdateParams({ release: 123 })).toThrow("Invalid parameters");
  });

  test("sandboxReleaseParams requires string threadId", () => {
    expect(sandboxReleaseParams({ threadId: "t1" })).toEqual({ threadId: "t1" });
    expect(() => sandboxReleaseParams({})).toThrow("Invalid parameters");
    expect(() => sandboxReleaseParams({ threadId: true })).toThrow("Invalid parameters");
  });

  test("computerCallParams normalizes bot flag to boolean", () => {
    expect(computerCallParams({ threadId: "t1" })).toEqual({ threadId: "t1", bot: false });
    expect(computerCallParams({ threadId: "t1", bot: true })).toEqual({
      threadId: "t1",
      bot: true,
    });
    expect(computerCallParams({ threadId: "t1", bot: "yes" })).toEqual({
      threadId: "t1",
      bot: false,
    });
    expect(() => computerCallParams({ bot: true })).toThrow("Invalid parameters");
  });

  test("steerParams validates strings, mentions array, and attachment shapes", () => {
    const attachment = { name: "a.txt", mediaType: "text/plain", size: 4, data: "dGVzdA==" };
    expect(
      steerParams({
        runId: "r1",
        steerId: "s1",
        prompt: "keep going",
        mentions: [],
        attachments: [attachment],
      }),
    ).toEqual({
      runId: "r1",
      steerId: "s1",
      prompt: "keep going",
      mentions: [],
      attachments: [attachment],
    });
    expect(() => steerParams({ runId: "r1", steerId: "s1" })).toThrow("Invalid parameters");
    expect(() =>
      steerParams({ runId: "r1", steerId: "s1", prompt: "hi", mentions: "nope" }),
    ).toThrow("Invalid parameters");
    expect(() =>
      steerParams({ runId: "r1", steerId: "s1", prompt: "hi", attachments: "nope" }),
    ).toThrow("Invalid parameters");
    expect(() =>
      steerParams({
        runId: "r1",
        steerId: "s1",
        prompt: "hi",
        attachments: [{ name: "a.txt", mediaType: "text/plain", size: "4", data: "x" }],
      }),
    ).toThrow("Invalid parameters");
  });

  test("foldersListParams enforces optional path and 4096 length cap", () => {
    expect(foldersListParams({})).toEqual({});
    expect(foldersListParams({ path: null })).toEqual({});
    expect(foldersListParams({ path: "/tmp" })).toEqual({ path: "/tmp" });
    expect(foldersListParams({ path: "a".repeat(4096) })).toEqual({ path: "a".repeat(4096) });
    expect(() => foldersListParams({ path: "a".repeat(4097) })).toThrow("Invalid parameters");
    expect(() => foldersListParams({ path: 12 })).toThrow("Invalid parameters");
  });

  test("foldersCreateParams requires string path and name", () => {
    expect(foldersCreateParams({ path: "/tmp", name: "app" })).toEqual({
      path: "/tmp",
      name: "app",
    });
    expect(() => foldersCreateParams({ path: "/tmp" })).toThrow("Invalid parameters");
    expect(() => foldersCreateParams({ name: "app" })).toThrow("Invalid parameters");
  });

  test("foldersCloneParams enforces non-empty repository up to 500 chars", () => {
    expect(foldersCloneParams({ repository: "acme/app" })).toEqual({ repository: "acme/app" });
    expect(foldersCloneParams({ repository: "a".repeat(500) })).toEqual({
      repository: "a".repeat(500),
    });
    expect(() => foldersCloneParams({ repository: "" })).toThrow("Invalid parameters");
    expect(() => foldersCloneParams({ repository: "a".repeat(501) })).toThrow("Invalid parameters");
    expect(() => foldersCloneParams({})).toThrow("Invalid parameters");
  });

  test("foldersFilesParams validates folder and optional path length bounds", () => {
    expect(foldersFilesParams({ folder: "/repo" })).toEqual({ folder: "/repo" });
    expect(foldersFilesParams({ folder: "/repo", path: null })).toEqual({ folder: "/repo" });
    expect(foldersFilesParams({ folder: "/repo", path: "src" })).toEqual({
      folder: "/repo",
      path: "src",
    });
    expect(() => foldersFilesParams({ folder: "a".repeat(4097) })).toThrow("Invalid parameters");
    expect(() => foldersFilesParams({ folder: "/repo", path: "a".repeat(4097) })).toThrow(
      "Invalid parameters",
    );
    expect(() => foldersFilesParams({ folder: "/repo", path: 5 })).toThrow("Invalid parameters");
  });

  test("foldersReadmeParams enforces string folder and 4096 length cap", () => {
    expect(foldersReadmeParams({ folder: "/repo" })).toEqual({ folder: "/repo" });
    expect(() => foldersReadmeParams({ folder: "a".repeat(4097) })).toThrow("Invalid parameters");
    expect(() => foldersReadmeParams({})).toThrow("Invalid parameters");
  });

  test("foldersCommitsParams enforces folder length and integer page bounds 1..10000", () => {
    expect(foldersCommitsParams({ folder: "/repo" })).toEqual({ folder: "/repo" });
    expect(foldersCommitsParams({ folder: "/repo", page: null })).toEqual({ folder: "/repo" });
    expect(foldersCommitsParams({ folder: "/repo", page: 1 })).toEqual({
      folder: "/repo",
      page: 1,
    });
    expect(foldersCommitsParams({ folder: "/repo", page: 10_000 })).toEqual({
      folder: "/repo",
      page: 10_000,
    });
    expect(() => foldersCommitsParams({ folder: "/repo", page: 0 })).toThrow("Invalid parameters");
    expect(() => foldersCommitsParams({ folder: "/repo", page: -1 })).toThrow("Invalid parameters");
    expect(() => foldersCommitsParams({ folder: "/repo", page: 10_001 })).toThrow(
      "Invalid parameters",
    );
    expect(() => foldersCommitsParams({ folder: "/repo", page: 1.5 })).toThrow(
      "Invalid parameters",
    );
    expect(() => foldersCommitsParams({ folder: "/repo", page: Number.POSITIVE_INFINITY })).toThrow(
      "Invalid parameters",
    );
    expect(() => foldersCommitsParams({ folder: "a".repeat(4097) })).toThrow("Invalid parameters");
  });

  test("processWatchParams validates allowed phases", () => {
    expect(processWatchParams({ threadId: "t1", phase: "arm" })).toEqual({
      threadId: "t1",
      phase: "arm",
    });
    expect(processWatchParams({ threadId: "t1", phase: "settle" })).toEqual({
      threadId: "t1",
      phase: "settle",
    });
    expect(processWatchParams({ threadId: "t1", phase: "suspend" })).toEqual({
      threadId: "t1",
      phase: "suspend",
    });
    expect(() => processWatchParams({ threadId: "t1", phase: "kill" })).toThrow(
      "Invalid parameters",
    );
    expect(() => processWatchParams({ phase: "arm" })).toThrow("Invalid parameters");
  });

  test("machineCallParams validates threadId and known machine ops", () => {
    expect(machineCallParams({ threadId: "t1", op: "exec", args: { command: "ls" } })).toEqual({
      threadId: "t1",
      op: "exec",
      args: { command: "ls" },
    });
    expect(() => machineCallParams({ threadId: "t1", op: "unknown.op" })).toThrow(
      "Invalid parameters",
    );
    expect(() => machineCallParams({ threadId: 9, op: "exec" })).toThrow("Invalid parameters");
  });
});
