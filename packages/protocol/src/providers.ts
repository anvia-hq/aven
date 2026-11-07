// A person's model providers as a bot manages them (decision 0086). A bot never sees an API key,
// and never gives one: the person types it into a masked card, which saves it to the provider.

import type { QuestionPrompt } from "./events";
import type { Provider } from "./runtime-wire";

/** A provider as a bot reads it: what it is, never its key, only whether it has one. */
export type BotProviderView = {
  id: string;
  kind: Provider;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  isDefault: boolean;
  hasKey: boolean;
};

/** Whether a provider of this kind cannot run without a key; a server of the person's own may need none. */
export const providerNeedsKey = (kind: Provider) => kind !== "openai-compatible";

/** Where Amazon Bedrock's OpenAI-compatible API is in a region (decision 0139). */
export const bedrockBaseUrl = (region: string) => `https://bedrock-mantle.${region}.api.aws/v1`;

/** A Bedrock endpoint, and so where a person's key may be sent: only AWS's own regional host. */
export const BEDROCK_ENDPOINT =
  /^https:\/\/bedrock-mantle\.([a-z]{2}(?:-[a-z]+)+-\d+)\.api\.aws\/v1\/?$/;

/** The region of a Bedrock endpoint, or null when the address is not one. */
export const bedrockRegionOf = (baseUrl: string | null | undefined) =>
  (baseUrl && BEDROCK_ENDPOINT.exec(baseUrl)?.[1]) || null;

/** Where Vertex AI's OpenAI-compatible API is for a project and a location (decision 0140). */
export const vertexBaseUrl = (project: string, location: string) => {
  const host = location === "global" ? "aiplatform" : `${location}-aiplatform`;
  return `https://${host}.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;
};

const VERTEX_ENDPOINT =
  /^https:\/\/(?:aiplatform|([a-z]+(?:-[a-z0-9]+)+)-aiplatform)\.googleapis\.com\/v1\/projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/locations\/(global|[a-z]+(?:-[a-z0-9]+)+)\/endpoints\/openapi\/?$/;

/** The project and location of a Vertex endpoint, or null when the address is not exactly one (the host's region must be the path's). */
export function vertexPartsOf(baseUrl: string | null | undefined) {
  const match = baseUrl ? VERTEX_ENDPOINT.exec(baseUrl) : null;
  if (!match) return null;
  const [, hostRegion, project, location] = match as unknown as [
    string,
    string | undefined,
    string,
    string,
  ];
  if ((hostRegion ?? "global") !== location) return null;
  return { project, location };
}

/**
 * The question a bot asks to get a provider's key: its card is a masked field, and the answer is
 * saved to the provider, so it is in no message, no transcript and nothing the bot reads.
 */
export type ProviderKeyAsk = { providerId: string; name: string };

/** The card a bot's request for a key is, as the chat shows it and as it is read back from the bot's memory. */
export const providerKeyQuestion = (
  providerKey: ProviderKeyAsk,
): QuestionPrompt & { providerKey: ProviderKeyAsk } => ({
  id: "key",
  text: `Enter the API key for ${providerKey.name}`,
  providerKey,
});
