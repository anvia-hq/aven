import { describe, expect, test } from "bun:test";
import { scriptedModel } from "@aven/agents/testing/scripted-model";

import { createDrafter } from "./draft";

const thread = { id: "t1", title: "Greet the user" };
const fallback = { title: "Greet the user", body: "Opened from an Aven thread." };
const writes = (text: string) => scriptedModel([[{ type: "text", text }]]);

describe("drafting a pull request's text", () => {
  test("is the model's title and description for the patch the runner has", async () => {
    const draft = createDrafter({
      patch: async () => "diff --git a/x b/x\n+hello\n",
      model: async () => writes("Add a greeting\n\nSays hello."),
    });

    expect(await draft("org", "user", thread)).toEqual({
      title: "Add a greeting",
      body: "Says hello.",
    });
  });

  test("is the thread's own title without a patch or without a model", async () => {
    const model = async () => writes("Never used");
    expect(await createDrafter({ patch: async () => null, model })("org", "user", thread)).toEqual(
      fallback,
    );
    expect(await createDrafter({ patch: async () => "", model })("org", "user", thread)).toEqual(
      fallback,
    );
    expect(
      await createDrafter({ patch: async () => "diff", model: async () => null })(
        "org",
        "user",
        thread,
      ),
    ).toEqual(fallback);
  });

  test("never fails the ship: a model or a runner that errors gives the fallback", async () => {
    const failing = scriptedModel([]);
    const withBrokenModel = createDrafter({
      patch: async () => "diff",
      model: async () => failing,
    });
    const withBrokenRunner = createDrafter({
      patch: async () => {
        throw new Error("runner offline");
      },
      model: async () => writes("T\n\nB"),
    });

    expect(await withBrokenModel("org", "user", thread)).toEqual(fallback);
    expect(await withBrokenRunner("org", "user", thread)).toEqual(fallback);
  });
});
