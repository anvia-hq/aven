import { describe, expect, test } from "bun:test";
import type { AnyTool } from "@anvia/core";

import { withPlacedUploads } from "./placed-uploads";

const tool = (call: AnyTool["call"]): AnyTool => ({
  name: "exec_command",
  definition: () => ({ name: "exec_command", description: "", parameters: {} }),
  call,
});

describe("withPlacedUploads", () => {
  test("adds where an attached file landed to the tool result", async () => {
    const note = "An attached file is now on the computer at /home/me/.aven/uploads/t1/a.txt.";
    const [wrapped] = withPlacedUploads([tool(async () => ({ stdout: "ok" }))], () => note);

    expect(await wrapped!.call({}, undefined)).toEqual({ stdout: "ok", uploads: note });
  });

  test("leaves the result as it is when no file landed", async () => {
    const [wrapped] = withPlacedUploads([tool(async () => ({ stdout: "ok" }))], () => undefined);

    expect(await wrapped!.call({}, undefined)).toEqual({ stdout: "ok" });
  });

  test("keeps a failure that happened before a file could land", async () => {
    const [wrapped] = withPlacedUploads(
      [tool(async () => Promise.reject(new Error("The computer is offline")))],
      () => undefined,
    );

    await expect(wrapped!.call({}, undefined)).rejects.toThrow("The computer is offline");
  });

  test("a failure after the file landed still says where it is", async () => {
    const note = "An attached file is now on the computer at /home/me/.aven/uploads/t1/a.txt.";
    const [wrapped] = withPlacedUploads(
      [tool(async () => Promise.reject(new Error("The command failed")))],
      () => note,
    );

    await expect(wrapped!.call({}, undefined)).rejects.toThrow(`The command failed\n${note}`);
  });
});
