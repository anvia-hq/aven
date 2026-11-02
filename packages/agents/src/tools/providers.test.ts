import { describe, expect, test } from "bun:test";
import type { BotProviderView } from "@aven/protocol/providers";

import {
  ADD_PROVIDER_TOOL_NAME,
  ASK_PROVIDER_KEY_TOOL_NAME,
  createProviderTools,
  LIST_PROVIDER_MODELS_TOOL_NAME,
  LIST_PROVIDERS_TOOL_NAME,
  REMOVE_PROVIDER_TOOL_NAME,
  UPDATE_PROVIDER_TOOL_NAME,
  type ProvidersHost,
} from "./providers";

const ID = "11111111-2222-4333-8444-555555555555";
const view: BotProviderView = {
  id: ID,
  kind: "anthropic",
  name: "Claude",
  baseUrl: null,
  modelId: null,
  isDefault: false,
  hasKey: false,
};

function host(options: { askKey?: boolean } = {}) {
  const calls: unknown[] = [];
  const hosted: ProvidersHost = {
    list: async () => (calls.push(["list"]), [view]),
    add: async (input) => (calls.push(["add", input]), view),
    update: async (id, patch) => (calls.push(["update", id, patch]), view),
    remove: async (id) => void calls.push(["remove", id]),
    models: async (id) => (calls.push(["models", id]), ["a", "b"]),
    askKey:
      options.askKey === false
        ? undefined
        : async (id) => (calls.push(["askKey", id]), { providerId: id, name: "Claude" }),
  };
  const tools = createProviderTools(hosted);
  // The tools come back as a list, each with its own input: tests call them with whatever a model might.
  const by = (name: string) =>
    tools.find((tool) => tool.name === name) as unknown as {
      call(input: Record<string, unknown>): Promise<unknown>;
    };
  return { calls, tools, by };
}

describe("the provider tools", () => {
  test("are six, named for what they do, and five where nobody can type a key", () => {
    expect(host().tools.map((tool) => tool.name)).toEqual([
      LIST_PROVIDERS_TOOL_NAME,
      ADD_PROVIDER_TOOL_NAME,
      UPDATE_PROVIDER_TOOL_NAME,
      REMOVE_PROVIDER_TOOL_NAME,
      LIST_PROVIDER_MODELS_TOOL_NAME,
      ASK_PROVIDER_KEY_TOOL_NAME,
    ]);
    expect(host({ askKey: false }).tools.map((tool) => tool.name)).not.toContain(
      ASK_PROVIDER_KEY_TOOL_NAME,
    );
  });

  test("add hands the host what the model chose, and an unknown field is not passed on", async () => {
    const { calls, by } = host();
    const result = await by(ADD_PROVIDER_TOOL_NAME).call({
      kind: "azure",
      name: " Work ",
      baseUrl: "https://w.openai.azure.com",
      modelId: "gpt",
      apiKey: "sk-should-not-pass",
    });
    expect(calls).toEqual([
      [
        "add",
        { kind: "azure", name: "Work", baseUrl: "https://w.openai.azure.com", modelId: "gpt" },
      ],
    ]);
    expect(JSON.stringify(calls)).not.toContain("sk-should-not-pass");
    expect(result).toEqual({ provider: view });
  });

  test("update gives only what changes, remove and models take the id", async () => {
    const { calls, by } = host();
    await by(UPDATE_PROVIDER_TOOL_NAME).call({ id: ID, isDefault: true });
    await by(REMOVE_PROVIDER_TOOL_NAME).call({ id: ID });
    expect(await by(LIST_PROVIDER_MODELS_TOOL_NAME).call({ id: ID })).toEqual({
      models: ["a", "b"],
    });
    expect(calls).toEqual([
      ["update", ID, { isDefault: true }],
      ["remove", ID],
      ["models", ID],
    ]);
  });

  test("asking for a key tells the bot to stop, and says which provider the form is for", async () => {
    const { by } = host();
    const result = (await by(ASK_PROVIDER_KEY_TOOL_NAME).call({ id: ID })) as {
      provider: { providerId: string; name: string };
      note: string;
    };
    expect(result.provider).toEqual({ providerId: ID, name: "Claude" });
    expect(result.note).toContain("Stop now");
  });

  test("an id that is not an id, a default that is not true, or a kind we do not know is refused before the host is asked", async () => {
    const { calls, by } = host();
    await expect(by(UPDATE_PROVIDER_TOOL_NAME).call({ id: "x" })).rejects.toThrow();
    await expect(
      by(UPDATE_PROVIDER_TOOL_NAME).call({ id: ID, isDefault: false }),
    ).rejects.toThrow();
    await expect(by(ADD_PROVIDER_TOOL_NAME).call({ kind: "grok", name: "x" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
