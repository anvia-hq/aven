import { describe, expect, test } from "bun:test";

import {
  COMPATIBLE_VENDORS,
  bedrockBaseUrl,
  bedrockRegionOf,
  catalogVendorOf,
  isModelApi,
  isSubscriptionProvider,
  providerBackend,
  providerKeyQuestion,
  providerNeedsKey,
  vertexBaseUrl,
  vertexPartsOf,
} from "./providers";

describe("provider classification", () => {
  test("distinguishes model APIs from subscription providers", () => {
    expect(isModelApi("openai")).toBe(true);
    expect(isModelApi("anthropic")).toBe(true);
    expect(isModelApi("openai-compatible")).toBe(true);
    expect(isModelApi("claude-subscription")).toBe(false);
    expect(isModelApi("codex-subscription")).toBe(false);
    expect(isModelApi("unknown")).toBe(false);

    expect(isSubscriptionProvider("claude-subscription")).toBe(true);
    expect(isSubscriptionProvider("codex-subscription")).toBe(true);
    expect(isSubscriptionProvider("openai")).toBe(false);
  });

  test("maps each provider kind to its backend and key requirement", () => {
    expect(providerBackend("claude-subscription")).toBe("claude");
    expect(providerBackend("codex-subscription")).toBe("codex");
    expect(providerBackend("openai")).toBe("native");
    expect(providerBackend("vertex")).toBe("native");

    expect(providerNeedsKey("openai")).toBe(true);
    expect(providerNeedsKey("claude-subscription")).toBe(true);
    expect(providerNeedsKey("openai-compatible")).toBe(false);
  });

  test("builds a provider key question with providerKey metadata", () => {
    expect(providerKeyQuestion({ providerId: "p-1", name: "OpenAI" })).toEqual({
      id: "key",
      text: "Enter the API key for OpenAI",
      providerKey: { providerId: "p-1", name: "OpenAI" },
    });
  });
});

describe("catalogVendorOf", () => {
  test("identifies known OpenAI-compatible hosts and returns null for local or unknown URLs", () => {
    expect(catalogVendorOf(COMPATIBLE_VENDORS.openrouter.baseUrl)).toBe("openrouter");
    expect(catalogVendorOf("https://api.groq.com/openai/v1/")).toBe("groq");
    expect(catalogVendorOf("https://api.deepseek.com/v1")).toBe("deepseek");
    expect(catalogVendorOf("https://api.mistral.ai/v1")).toBe("mistral");
    expect(catalogVendorOf("https://api.x.ai/v1")).toBe("xai");
    expect(catalogVendorOf(COMPATIBLE_VENDORS.ollama.baseUrl)).toBeNull();
    expect(catalogVendorOf("https://example.com/v1")).toBeNull();
    expect(catalogVendorOf("not-a-url")).toBeNull();
    expect(catalogVendorOf(null)).toBeNull();
    expect(catalogVendorOf(undefined)).toBeNull();
  });
});

describe("bedrockRegionOf", () => {
  test("extracts AWS regions from Bedrock Mantle endpoints", () => {
    expect(bedrockRegionOf(bedrockBaseUrl("us-east-1"))).toBe("us-east-1");
    expect(bedrockRegionOf("https://bedrock-mantle.eu-central-1.api.aws/v1/")).toBe("eu-central-1");
    expect(bedrockRegionOf("https://bedrock-mantle.ap-southeast-2.api.aws/v1")).toBe(
      "ap-southeast-2",
    );
  });

  test("rejects non-Bedrock hosts, http, or malformed regions", () => {
    expect(bedrockRegionOf("http://bedrock-mantle.us-east-1.api.aws/v1")).toBeNull();
    expect(bedrockRegionOf("https://bedrock-mantle.us-east-1.api.aws.evil.com/v1")).toBeNull();
    expect(bedrockRegionOf("https://bedrock-mantle.us-east-1.api.aws/v2")).toBeNull();
    expect(bedrockRegionOf(null)).toBeNull();
    expect(bedrockRegionOf(undefined)).toBeNull();
  });
});

describe("vertexPartsOf", () => {
  test("parses both regional and global Vertex AI OpenAPI endpoints", () => {
    const regional = vertexBaseUrl("my-project-123", "europe-west4");
    expect(regional).toBe(
      "https://europe-west4-aiplatform.googleapis.com/v1/projects/my-project-123/locations/europe-west4/endpoints/openapi",
    );
    expect(vertexPartsOf(regional)).toEqual({
      project: "my-project-123",
      location: "europe-west4",
    });
    expect(vertexPartsOf(`${regional}/`)).toEqual({
      project: "my-project-123",
      location: "europe-west4",
    });

    const global = vertexBaseUrl("my-project-123", "global");
    expect(global).toBe(
      "https://aiplatform.googleapis.com/v1/projects/my-project-123/locations/global/endpoints/openapi",
    );
    expect(vertexPartsOf(global)).toEqual({ project: "my-project-123", location: "global" });
  });

  test("rejects mismatched host/location, non-https, or invalid hosts", () => {
    expect(
      vertexPartsOf(
        "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project-123/locations/europe-west4/endpoints/openapi",
      ),
    ).toBeNull();
    expect(
      vertexPartsOf(
        "https://aiplatform.googleapis.com/v1/projects/my-project-123/locations/us-central1/endpoints/openapi",
      ),
    ).toBeNull();
    expect(
      vertexPartsOf(
        "https://aiplatform.googleapis.com.evil.com/v1/projects/my-project-123/locations/global/endpoints/openapi",
      ),
    ).toBeNull();
    expect(
      vertexPartsOf(
        "http://aiplatform.googleapis.com/v1/projects/my-project-123/locations/global/endpoints/openapi",
      ),
    ).toBeNull();
    expect(vertexPartsOf(null)).toBeNull();
    expect(vertexPartsOf(undefined)).toBeNull();
  });
});
