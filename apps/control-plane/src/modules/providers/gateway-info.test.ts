import { describe, expect, test } from "bun:test";

import { createGatewayContext } from "./gateway-context";

const info = (...models: { name: string; info: Record<string, unknown> }[]) => ({
  data: models.map(({ name, info }) => ({ model_name: name, model_info: info })),
});

function gateway(body: unknown, status = 200) {
  const calls: { url: string; authorization?: string }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, authorization: (init.headers as Record<string, string>).authorization });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

describe("a gateway's context window", () => {
  test("reads max_input_tokens of the model from /model/info, with the provider's key", async () => {
    const { fetch, calls } = gateway(
      info(
        { name: "other", info: { max_input_tokens: 1000 } },
        { name: "muse", info: { max_input_tokens: 128000, max_tokens: 4096 } },
      ),
    );

    const window = await createGatewayContext({ fetch })("https://gw.test/v1/", "sk-1", "muse");

    expect(window).toBe(128000);
    expect(calls).toEqual([{ url: "https://gw.test/v1/model/info", authorization: "Bearer sk-1" }]);
  });

  test("knows nothing of a model it does not list, or lists without an input limit", async () => {
    const { fetch } = gateway(
      info(
        { name: "muse", info: { max_input_tokens: 32000 } },
        { name: "writer", info: { max_tokens: 4096, max_output_tokens: 4096 } },
      ),
    );
    const context = createGatewayContext({ fetch });

    expect(await context("https://gw.test/v1", undefined, "muse")).toBe(32000);
    expect(await context("https://gw.test/v1", undefined, "missing")).toBeNull();
    expect(await context("https://gw.test/v1", undefined, "writer")).toBeNull();
  });

  test("is no window when the gateway refuses, fails or answers with something else", async () => {
    const refused = gateway({ error: "no" }, 401);
    const odd = gateway({ data: "nope" });
    const down = async () => {
      throw new Error("connection refused");
    };

    expect(await createGatewayContext(refused)("https://gw.test/v1", "k", "muse")).toBeNull();
    expect(await createGatewayContext(odd)("https://gw.test/v1", "k", "muse")).toBeNull();
    expect(
      await createGatewayContext({ fetch: down })("https://gw.test/v1", "k", "muse"),
    ).toBeNull();
  });

  test("asks once an hour for a model it found", async () => {
    let time = 0;
    const { fetch, calls } = gateway(info({ name: "muse", info: { max_input_tokens: 8000 } }));
    const context = createGatewayContext({ fetch, now: () => time });

    await context("https://gw.test/v1", "k", "muse");
    await context("https://gw.test/v1", "k", "muse");
    time = 61 * 60 * 1000;
    await context("https://gw.test/v1", "k", "muse");

    expect(calls).toHaveLength(2);
  });
});
