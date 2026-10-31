import { describe, expect, test } from "bun:test";

import { projectToolOutput, toolTarget } from "./tool-projection";

describe("the sandbox's tools", () => {
  test("each shows what it acts on", () => {
    const target = (name: string, input: unknown) => toolTarget(name, input);
    expect(target("read_file", { path: "a.txt" })).toBe("a.txt");
    expect(target("write_file", { path: "b.txt", content: "x" })).toBe("b.txt");
    expect(target("edit", { path: "c.txt" })).toBe("c.txt");
    expect(target("list_files", { path: "src" })).toBe("src");
    expect(target("list_files", {})).toBe("");
    expect(target("exec_command", { command: "bun test" })).toBe("bun test");
    expect(target("start_process", { command: "bun run dev" })).toBe("bun run dev");
    expect(target("read_process_logs", { processId: "p1" })).toBe("p1");
    expect(target("stop_process", { processId: "p1" })).toBe("p1");
    expect(target("wait_for_port", { containerPort: 3000 })).toBe("3000");
    expect(target("web_search", { query: "bun" })).toBe("bun");
    expect(target("git_fetch", { branch: "main" })).toBe("main");
    expect(target("git_fetch", {})).toBe("default branch");
    expect(target("desktop_click", { x: 1, y: 2 })).toBe("");
  });

  test("a fetch's result reads as what it did", () => {
    const result = {
      ref: "origin/main",
      commit: "a".repeat(40),
      updated: true,
      summary: "origin/main is now at aaaaaaa.",
    };
    expect(projectToolOutput({ type: "json", value: result as never }, "git_fetch")).toEqual({
      status: "done",
      output: "origin/main is now at aaaaaaa.",
    });
  });

  test("their results read as text, not as JSON payloads", () => {
    const json = (value: unknown) => projectToolOutput({ type: "json", value: value as never });
    const base = { durationMs: 1, stdoutTruncated: false, stderrTruncated: false };
    expect(json({ status: "exited", exitCode: 0, stdout: "hi\n", stderr: "", ...base })).toEqual({
      status: "done",
      output: "hi\n",
    });
    expect(
      json({ status: "exited", exitCode: 2, stdout: "", stderr: "boom", ...base }).output,
    ).toBe("boom\n[exit 2]");
    expect(json({ status: "timed_out", stdout: "", stderr: "", ...base }).output).toBe(
      "[timed out]",
    );
    expect(json({ path: "a.txt", bytesWritten: 5 }).output).toBe("Wrote 5 bytes to a.txt");
    expect(
      json({
        path: ".",
        entries: [
          { path: "src", type: "directory" },
          { path: "a.txt", type: "file" },
        ],
      }).output,
    ).toBe("directory\tsrc\nfile\ta.txt");
    expect(json({ id: "p1", status: "running" }).output).toBe('{"id":"p1","status":"running"}');
  });
});
