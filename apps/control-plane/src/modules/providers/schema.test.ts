import { describe, expect, test } from "bun:test";

import { listModelsBody } from "./schema";

const serviceAccount = JSON.stringify({
  type: "service_account",
  project_id: "my-project-123",
  private_key_id: "0123456789abcdef",
  private_key: `-----BEGIN PRIVATE KEY-----\n${"A".repeat(1800)}\n-----END PRIVATE KEY-----\n`,
  client_email: "a@my-project-123.iam.gserviceaccount.com",
  client_id: "123456789",
});

describe("listModelsBody", () => {
  test("takes the same Vertex AI service account key that create takes, which is longer than an API key", () => {
    expect(serviceAccount.length).toBeGreaterThan(500);
    const parsed = listModelsBody.safeParse({ kind: "vertex", apiKey: serviceAccount });
    expect(parsed.success).toBe(true);
  });

  test("still refuses a key that is too long or empty for the other kinds", () => {
    expect(listModelsBody.safeParse({ kind: "openai", apiKey: "k".repeat(501) }).success).toBe(
      false,
    );
    expect(listModelsBody.safeParse({ kind: "anthropic", apiKey: "" }).success).toBe(false);
    expect(listModelsBody.safeParse({ kind: "openai", apiKey: serviceAccount }).success).toBe(
      false,
    );
  });

  test("refuses a Vertex AI key that is not a service account or a token", () => {
    expect(listModelsBody.safeParse({ kind: "vertex", apiKey: "not a credential" }).success).toBe(
      false,
    );
    expect(listModelsBody.safeParse({ kind: "vertex", apiKey: "" }).success).toBe(false);
  });

  test("a request with no key is still fine", () => {
    expect(
      listModelsBody.safeParse({ kind: "openai-compatible", baseUrl: "https://x.example/v1" })
        .success,
    ).toBe(true);
  });
});
