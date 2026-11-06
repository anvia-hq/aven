import { createTool } from "@anvia/core";
import type { BotProviderView, ProviderKeyAsk } from "@aven/protocol/providers";
import { PROVIDERS } from "@aven/protocol/runtime-wire";
import { z } from "zod";

export const LIST_PROVIDERS_TOOL_NAME = "list_providers";
export const ADD_PROVIDER_TOOL_NAME = "add_provider";
export const UPDATE_PROVIDER_TOOL_NAME = "update_provider";
export const REMOVE_PROVIDER_TOOL_NAME = "remove_provider";
export const LIST_PROVIDER_MODELS_TOOL_NAME = "list_provider_models";
export const ASK_PROVIDER_KEY_TOOL_NAME = "ask_provider_key";

/**
 * What a bot may ask of the person's model providers (decision 0086); what each takes and may refuse
 * is the host's. There is no key anywhere in it: `askKey` is how the person gives one, in a masked
 * card, and it is left out of a host with nobody to answer.
 */
export type ProvidersHost = {
  list(): Promise<BotProviderView[]>;
  add(input: ProviderInput): Promise<BotProviderView>;
  update(id: string, patch: ProviderPatch): Promise<BotProviderView>;
  remove(id: string): Promise<void>;
  models(id: string): Promise<string[]>;
  askKey?(id: string): Promise<ProviderKeyAsk>;
};

const name = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe("What the person calls it, such as `Work Azure`.");
const modelId = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe(
    "The model it runs by default. For Azure, the name of a deployment in the resource. Check it with list_provider_models once the key is saved.",
  );
const baseUrl = z
  .string()
  .trim()
  .max(500)
  .describe(
    "Azure: the resource URL, https://<resource>.openai.azure.com. An OpenAI-compatible server: its root, such as https://gateway.example.com/v1. Not used by openai, anthropic or gemini.",
  );
const id = z.uuid().describe("The provider id from list_providers.");

const addSchema = z.object({
  kind: z.enum(PROVIDERS).describe("openai, anthropic, gemini, azure or openai-compatible."),
  name,
  baseUrl: baseUrl.optional(),
  modelId: modelId.optional(),
  isDefault: z
    .boolean()
    .optional()
    .describe(
      "Make it the one the person's messages use. Only a provider that has its key can be.",
    ),
});
const updateSchema = z.object({
  id,
  name: name.optional(),
  baseUrl: baseUrl.optional(),
  modelId: modelId.optional(),
  isDefault: z.literal(true).optional().describe("Make it the default. It has to have its key."),
});

export type ProviderInput = z.infer<typeof addSchema>;
export type ProviderPatch = Omit<z.infer<typeof updateSchema>, "id">;

const KEY_SHOWN =
  "The key form is on the person's screen. Stop now and send nothing else: they type the key there, it is saved to the provider without passing through you, and they will tell you in their next message.";

// How a bot keeps the person's providers (decision 0086). It never sees or writes a key: it makes a
// provider without one and asks the person for it with a masked card. The host holds to whose word
// may change anything, and what a bot may not do: a provider moved to another address forgets its key.
export function createProviderTools(host: ProvidersHost) {
  const list = createTool({
    name: LIST_PROVIDERS_TOOL_NAME,
    description:
      "List the person's model providers: their kinds, names, addresses, default models, which is the default, and whether each has its API key (never the key).",
    inputSchema: z.object({}),
    execute: async () => ({ providers: await host.list() }),
  });
  const add = createTool({
    name: ADD_PROVIDER_TOOL_NAME,
    description:
      "Add a model provider for the person, when they ask. It starts with no API key: right after, call ask_provider_key so the person can type it. Never ask for the key in a message, and never make up an address, a model or a name.",
    inputSchema: addSchema,
    execute: async (input) => ({ provider: await host.add(input) }),
  });
  const update = createTool({
    name: UPDATE_PROVIDER_TOOL_NAME,
    description:
      "Change a provider's name, address or default model, or make it the default. Give only what changes. Moving a provider to another address removes its key: call ask_provider_key afterwards.",
    inputSchema: updateSchema,
    execute: async ({ id, ...patch }) => ({ provider: await host.update(id, patch) }),
  });
  const remove = createTool({
    name: REMOVE_PROVIDER_TOOL_NAME,
    description:
      "Remove a provider and its saved key for good: the person would have to type the key again. Make sure that is what they asked for.",
    inputSchema: z.object({ id }),
    execute: async ({ id }) => {
      await host.remove(id);
      return { removed: true };
    },
  });
  const models = createTool({
    name: LIST_PROVIDER_MODELS_TOOL_NAME,
    description:
      "List the models a provider offers, asked with its saved key. For Azure these are the deployments of the resource. It needs the key to be saved.",
    inputSchema: z.object({ id }),
    execute: async ({ id }) => ({ models: await host.models(id) }),
  });
  const askKey = host.askKey?.bind(host);
  const ask = askKey
    ? [
        createTool({
          name: ASK_PROVIDER_KEY_TOOL_NAME,
          description:
            "Show the person a masked form for a provider's API key, which is saved to the provider without passing through you. Use it after add_provider, or when a provider has no key. Your turn ends there; they tell you when it is saved.",
          inputSchema: z.object({ id }),
          execute: async ({ id }) => ({ provider: await askKey(id), note: KEY_SHOWN }),
        }),
      ]
    : [];
  return [list, add, update, remove, models, ...ask];
}
