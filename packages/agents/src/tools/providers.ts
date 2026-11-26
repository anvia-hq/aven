import { createTool } from "@anvia/core";
import {
  providerBaseUrlInput,
  providerModelId,
  providerName,
} from "@aven/protocol/provider-schema";
import { PROVIDERS } from "@aven/protocol/runtime-wire";
import { z } from "zod";
import type { ProvidersHost } from "./types";
import type { BotProviderView, ProviderKeyAsk } from "@aven/protocol/types";

export const LIST_PROVIDERS_TOOL_NAME = "list_providers";
export const ADD_PROVIDER_TOOL_NAME = "add_provider";
export const UPDATE_PROVIDER_TOOL_NAME = "update_provider";
export const REMOVE_PROVIDER_TOOL_NAME = "remove_provider";
export const LIST_PROVIDER_MODELS_TOOL_NAME = "list_provider_models";
export const ASK_PROVIDER_KEY_TOOL_NAME = "ask_provider_key";

const name = providerName.describe("What the person calls it, such as `Work Azure`.");
const modelId = providerModelId.describe(
  "The model it runs by default. For Azure, the name of a deployment in the resource; for Vertex AI, a model such as google/gemini-2.5-flash. Check it with list_provider_models once the key is saved.",
);
const baseUrl = providerBaseUrlInput.describe(
  "Azure: the resource URL, https://<resource>.openai.azure.com. Google Vertex AI: the project's endpoint, https://<location>-aiplatform.googleapis.com/v1/projects/<project>/locations/<location>/endpoints/openapi (aiplatform.googleapis.com for the global location). Amazon Bedrock: its regional endpoint, https://bedrock-mantle.<region>.api.aws/v1 (a change of region is a change of address, so the key is asked again). An OpenAI-compatible server: its root, such as https://gateway.example.com/v1. Not used by openai, anthropic or gemini.",
);
const id = z.uuid().describe("The provider id from list_providers.");

const addSchema = z.object({
  kind: z
    .enum(PROVIDERS)
    .describe("openai, anthropic, gemini, bedrock, vertex, azure or openai-compatible."),
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
const MAX_MODELS_SHOWN = 100;

function formatProvider(provider: BotProviderView) {
  const parts = [provider.id, `${provider.name} (${provider.kind})`];

  if (provider.modelId) parts.push(`model ${provider.modelId}`);

  if (provider.baseUrl) parts.push(provider.baseUrl);

  parts.push(provider.hasKey ? "key saved" : "no key");

  if (provider.isDefault) parts.push("default");

  return `- ${parts.join(" · ")}`;
}

export function createProviderTools(
  host: ProvidersHost,
  onKeyAsked?: (provider: ProviderKeyAsk, text: string) => void,
) {
  const list = createTool({
    name: LIST_PROVIDERS_TOOL_NAME,
    description:
      "List the person's model providers: their kinds, names, addresses, default models, which is the default, and whether each has its API key (never the key).",
    inputSchema: z.object({}),
    handler: async () => {
      const providers = await host.list();
      return providers.length > 0
        ? providers.map(formatProvider).join("\n")
        : "No providers configured.";
    },
  });
  const add = createTool({
    name: ADD_PROVIDER_TOOL_NAME,
    description:
      "Add a model provider for the person, when they ask. It starts with no API key: right after, call ask_provider_key so the person can type it. Never ask for the key in a message, and never make up an address, a model or a name.",
    inputSchema: addSchema,
    handler: async (input) => {
      const provider = await host.add(input);
      return `Added provider:\n${formatProvider(provider)}`;
    },
  });
  const update = createTool({
    name: UPDATE_PROVIDER_TOOL_NAME,
    description:
      "Change a provider's name, address or default model, or make it the default. Give only what changes. Moving a provider to another address removes its key: call ask_provider_key afterwards.",
    inputSchema: updateSchema,
    handler: async ({ id, ...patch }) => {
      const provider = await host.update(id, patch);
      return `Updated provider:\n${formatProvider(provider)}`;
    },
  });
  const remove = createTool({
    name: REMOVE_PROVIDER_TOOL_NAME,
    description:
      "Remove a provider and its saved key for good: the person would have to type the key again. Make sure that is what they asked for.",
    inputSchema: z.object({ id }),
    handler: async ({ id }) => {
      await host.remove(id);
      return `Removed provider ${id}.`;
    },
  });
  const models = createTool({
    name: LIST_PROVIDER_MODELS_TOOL_NAME,
    description:
      "List the models a provider offers, asked with its saved key. For Azure these are the deployments of the resource. It needs the key to be saved.",
    inputSchema: z.object({ id }),
    handler: async ({ id }) => {
      const all = await host.models(id);

      if (all.length === 0) return "No models returned by this provider.";

      const shown = all.slice(0, MAX_MODELS_SHOWN);

      if (all.length > MAX_MODELS_SHOWN) {
        shown.push(`[${all.length - MAX_MODELS_SHOWN} more models not shown]`);
      }

      return shown.join("\n");
    },
  });
  const askKey = host.askKey?.bind(host);
  const ask = askKey
    ? [
        createTool({
          name: ASK_PROVIDER_KEY_TOOL_NAME,
          description:
            "Show the person a masked form for a provider's API key, which is saved to the provider without passing through you. Use it after add_provider, or when a provider has no key. Your turn ends there; they tell you when it is saved.",
          inputSchema: z.object({ id }),
          handler: async ({ id }) => {
            const provider = await askKey(id);
            const text = `Requested API key for ${provider.name}. ${KEY_SHOWN}`;
            onKeyAsked?.(provider, text);
            return text;
          },
        }),
      ]
    : [];
  return [list, add, update, remove, models, ...ask];
}
