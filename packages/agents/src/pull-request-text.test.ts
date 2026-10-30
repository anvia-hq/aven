import { describe, expect, test } from "bun:test";
import type { CompletionRequest } from "@anvia/core";

import { draftPullRequest, parsePullRequestText } from "./pull-request-text";
import { scriptedModel } from "./testing/scripted-model";

const fallback = { title: "Thread title", body: "Opened from an Aven thread." };

describe("parsing a model's reply", () => {
  test("takes the first line as the title and the rest as the description", () => {
    expect(parsePullRequestText("Add a greeting\n\n- says hello\n- says bye\n", fallback)).toEqual({
      title: "Add a greeting",
      body: "- says hello\n- says bye",
    });
  });

  test("strips what a model dresses a title in", () => {
    for (const first of [
      "# Add a greeting",
      "Title: Add a greeting",
      '"Add a greeting"',
      "`Add a greeting`",
    ]) {
      expect(parsePullRequestText(`${first}\n\nBody`, fallback).title).toBe("Add a greeting");
    }
  });

  test("keeps the fallback description when there is none", () => {
    expect(parsePullRequestText("Add a greeting", fallback)).toEqual({
      title: "Add a greeting",
      body: fallback.body,
    });
  });

  test("falls back when there is no title, or one that runs on", () => {
    expect(parsePullRequestText("", fallback)).toEqual(fallback);
    expect(parsePullRequestText(`${"word ".repeat(40)}\n\nBody`, fallback)).toEqual(fallback);
  });
});

describe("drafting a pull request", () => {
  test("gives the model the intent and the diff, with no tools, and parses its answer", async () => {
    let asked: CompletionRequest | undefined;
    const model = scriptedModel([
      (request) => {
        asked = request;
        return [{ type: "text", text: "Add a greeting\n\nSays hello." }];
      },
    ]);

    const text = await draftPullRequest(
      model,
      { intent: "greet the user", patch: "diff --git a/x b/x\n+hello\n" },
      fallback,
    );

    expect(text).toEqual({ title: "Add a greeting", body: "Says hello." });
    expect(asked?.tools).toEqual([]);
    const prompt = JSON.stringify(asked?.chatHistory);
    expect(prompt).toContain("greet the user");
    expect(prompt).toContain("+hello");
  });

  test("cuts a patch that is too long and says so", async () => {
    let asked: CompletionRequest | undefined;
    const model = scriptedModel([
      (request) => {
        asked = request;
        return [{ type: "text", text: "T\n\nB" }];
      },
    ]);

    await draftPullRequest(model, { intent: "x", patch: "a".repeat(100_000) }, fallback);

    const prompt = JSON.stringify(asked?.chatHistory);
    expect(prompt.length).toBeLessThan(70_000);
    expect(prompt).toContain("the rest of the diff is not shown");
  });
});
