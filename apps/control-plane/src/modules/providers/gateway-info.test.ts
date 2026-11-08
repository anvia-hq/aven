import { afterAll, describe, expect, test } from "bun:test";

import { createGatewayInfo } from "./gateway-info";

const allowedBefore = process.env.PROVIDER_ALLOWED_HOSTS;
process.env.PROVIDER_ALLOWED_HOSTS = "gw.test";
afterAll(() => {
  if (allowedBefore === undefined) delete process.env.PROVIDER_ALLOWED_HOSTS;
  else process.env.PROVIDER_ALLOWED_HOSTS = allowedBefore;
});

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

const NOTHING = { contextWindow: null, effortLevels: null };

describe("a gateway's context window", () => {
  test("reads max_input_tokens of the model from /model/info, with the provider's key", async () => {
    const { fetch, calls } = gateway(
      info(
        { name: "other", info: { max_input_tokens: 1000 } },
        { name: "muse", info: { max_input_tokens: 128000, max_tokens: 4096 } },
      ),
    );

    const model = await createGatewayInfo({ fetch })("https://gw.test/v1/", "sk-1", "muse");

    expect(model.contextWindow).toBe(128000);
    expect(calls).toEqual([{ url: "https://gw.test/v1/model/info", authorization: "Bearer sk-1" }]);
  });

  test("knows nothing of a model it does not list, or lists without an input limit", async () => {
    const { fetch } = gateway(
      info(
        { name: "muse", info: { max_input_tokens: 32000 } },
        { name: "writer", info: { max_tokens: 4096, max_output_tokens: 4096 } },
      ),
    );
    const model = createGatewayInfo({ fetch });

    expect((await model("https://gw.test/v1", undefined, "muse")).contextWindow).toBe(32000);
    expect(await model("https://gw.test/v1", undefined, "missing")).toEqual(NOTHING);
    expect((await model("https://gw.test/v1", undefined, "writer")).contextWindow).toBeNull();
  });

  test("says nothing when the gateway refuses, fails or answers with something else", async () => {
    const refused = gateway({ error: "no" }, 401);
    const odd = gateway({ data: "nope" });
    const down = async () => {
      throw new Error("connection refused");
    };

    expect(await createGatewayInfo(refused)("https://gw.test/v1", "k", "muse")).toEqual(NOTHING);
    expect(await createGatewayInfo(odd)("https://gw.test/v1", "k", "muse")).toEqual(NOTHING);
    expect(await createGatewayInfo({ fetch: down })("https://gw.test/v1", "k", "muse")).toEqual(
      NOTHING,
    );
  });

  test("asks once an hour, once for all the models of a gateway", async () => {
    let time = 0;
    const { fetch, calls } = gateway(
      info(
        { name: "muse", info: { max_input_tokens: 8000 } },
        { name: "spark", info: { max_input_tokens: 4000 } },
      ),
    );
    const model = createGatewayInfo({ fetch, now: () => time });

    await model("https://gw.test/v1", "k", "muse");
    await model("https://gw.test/v1", "k", "spark");
    await model("https://gw.test/v1", "k", "muse");
    expect(calls).toHaveLength(1);

    time = 61 * 60 * 1000;
    await model("https://gw.test/v1", "k", "muse");
    expect(calls).toHaveLength(2);
  });

  test("does not remember a failure: the next ask tries the gateway again", async () => {
    let up = false;
    const fetch = async () =>
      up
        ? Response.json(info({ name: "muse", info: { max_input_tokens: 8000 } }))
        : new Response("down", { status: 503 });
    const model = createGatewayInfo({ fetch });

    expect(await model("https://gw.test/v1", "k", "muse")).toEqual(NOTHING);
    up = true;
    expect((await model("https://gw.test/v1", "k", "muse")).contextWindow).toBe(8000);
  });

  test("models asked for at the same moment share one request", async () => {
    const { fetch, calls } = gateway(
      info(
        { name: "muse", info: { max_input_tokens: 8000 } },
        { name: "spark", info: { max_input_tokens: 4000 } },
      ),
    );
    const model = createGatewayInfo({ fetch });

    await Promise.all(["muse", "spark", "muse"].map((id) => model("https://gw.test/v1", "k", id)));

    expect(calls).toHaveLength(1);
  });

  test("does not hand one key's answer to another", async () => {
    const { fetch, calls } = gateway(info({ name: "muse", info: { max_input_tokens: 8000 } }));
    const model = createGatewayInfo({ fetch });

    await model("https://gw.test/v1", "key-a", "muse");
    await model("https://gw.test/v1", "key-b", "muse");

    expect(calls.map((call) => call.authorization)).toEqual(["Bearer key-a", "Bearer key-b"]);
  });
});

describe("a gateway's reasoning effort levels", () => {
  const levels = ["minimal", "low", "medium", "high", "xhigh", "max"];

  test("are the ones it lists for a model that supports an effort", async () => {
    const { fetch } = gateway(
      info({
        name: "muse",
        info: { supports_reasoning_effort: true, reasoning_effort_levels: levels },
      }),
    );

    expect(
      (await createGatewayInfo({ fetch })("https://gw.test/v1", "k", "muse")).effortLevels,
    ).toEqual(levels);
  });

  test("are none when the model does not support an effort, or lists no levels", async () => {
    const { fetch } = gateway(
      info(
        { name: "plain", info: { supports_reasoning: true } },
        {
          name: "off",
          info: { supports_reasoning_effort: false, reasoning_effort_levels: levels },
        },
        { name: "empty", info: { supports_reasoning_effort: true, reasoning_effort_levels: [] } },
        {
          name: "odd",
          info: { supports_reasoning_effort: true, reasoning_effort_levels: [1, ""] },
        },
      ),
    );
    const model = createGatewayInfo({ fetch });

    for (const name of ["plain", "off", "empty", "odd"]) {
      expect((await model("https://gw.test/v1", "k", name)).effortLevels).toBeNull();
    }
  });
});
