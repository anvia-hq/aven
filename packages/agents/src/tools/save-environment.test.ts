import { describe, expect, test } from "bun:test";

import { projectToolOutput } from "../projection";
import { createSaveEnvironmentTool } from "./save-environment";

describe("save_environment", () => {
  test("saves the environment and tells the agent what follows", async () => {
    let saved = 0;
    const tool = createSaveEnvironmentTool(async () => {
      saved++;
      return { image: "aven-env-k" };
    });

    const result = await tool.call({});

    expect(saved).toBe(1);
    expect(result.saved).toBe(true);
    expect(result.summary).toContain("commit the .aven folder");
  });

  test("a setup that fails is the tool's error, with the script's output", async () => {
    const tool = createSaveEnvironmentTool(async () => {
      throw new Error(".aven/setup failed (exit 2):\nE: unable to locate package nope");
    });

    await expect(tool.call({})).rejects.toThrow("unable to locate package nope");
  });

  test("a client sees what it did, not the payload", () => {
    const output = projectToolOutput(
      { type: "json", value: { saved: true, summary: "The environment is saved." } },
      "save_environment",
    );

    expect(output).toEqual({ status: "done", output: "The environment is saved." });
  });
});
