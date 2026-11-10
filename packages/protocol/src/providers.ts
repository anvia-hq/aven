import type { Provider, ProviderKeyAsk, QuestionPrompt } from "./types";

export const providerNeedsKey = (kind: Provider) =>
  kind !== "openai-compatible" && kind !== "codex";

export const bedrockBaseUrl = (region: string) => `https://bedrock-mantle.${region}.api.aws/v1`;

export const BEDROCK_ENDPOINT =
  /^https:\/\/bedrock-mantle\.([a-z]{2}(?:-[a-z]+)+-\d+)\.api\.aws\/v1\/?$/;

export const bedrockRegionOf = (baseUrl: string | null | undefined) =>
  (baseUrl && BEDROCK_ENDPOINT.exec(baseUrl)?.[1]) || null;

export const vertexBaseUrl = (project: string, location: string) => {
  const host = location === "global" ? "aiplatform" : `${location}-aiplatform`;
  return `https://${host}.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`;
};

const VERTEX_ENDPOINT =
  /^https:\/\/(?:aiplatform|([a-z]+(?:-[a-z0-9]+)+)-aiplatform)\.googleapis\.com\/v1\/projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/locations\/(global|[a-z]+(?:-[a-z0-9]+)+)\/endpoints\/openapi\/?$/;

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

export const providerKeyQuestion = (
  providerKey: ProviderKeyAsk,
): QuestionPrompt & { providerKey: ProviderKeyAsk } => ({
  id: "key",
  text: `Enter the API key for ${providerKey.name}`,
  providerKey,
});
