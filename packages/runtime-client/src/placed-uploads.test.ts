import { describe, expect, test } from "bun:test";
import type { AnyTool } from "@anvia/core";
import { ToolOutput, normalizeToolResultOutput } from "@anvia/core/tool";

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

  test("adds the note to a picture the tool returns, and the picture still reaches the model", async () => {
    const note = "An attached file is now on the computer at /home/me/.aven/uploads/t1/a.txt.";
    const picture = ToolOutput.content([
      { type: "text", text: "photo.png" },
      {
        type: "file",
        data: { type: "data", data: "abc" },
        mediaType: "image/png",
        filename: "photo.png",
      },
    ]);
    const [wrapped] = withPlacedUploads([tool(async () => picture)], () => note);

    const result = await wrapped!.call({}, undefined);
    const normalized = normalizeToolResultOutput(result);

    expect(result).toMatchObject({
      content: [
        { type: "text", text: "photo.png" },
        { type: "file", mediaType: "image/png", filename: "photo.png" },
        { type: "text", text: note },
      ],
    });
    expect(normalized.type).toBe("content");
    if (normalized.type !== "content") return;
    expect(normalized.value).toContainEqual({ type: "text", text: note });
  });

  test("a list or a bare value still says where the file landed", async () => {
    const note = "An attached file is now on the computer at /home/me/.aven/uploads/t1/a.txt.";
    const [listed] = withPlacedUploads([tool(async () => ["ok"])], () => note);
    const [counted] = withPlacedUploads([tool(async () => 3)], () => note);

    expect(await listed!.call({}, undefined)).toBe(`["ok"]\n${note}`);
    expect(await counted!.call({}, undefined)).toBe(`3\n${note}`);
  });
});
