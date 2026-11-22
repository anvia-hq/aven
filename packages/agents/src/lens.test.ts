import { afterAll, describe, expect, test } from "bun:test";

import { createCodingAgent } from "./coding-agent";
import { closeLens, lensObservability } from "./lens";
import type { RunLens } from "@aven/protocol/types";

const lens: RunLens = {
  baseUrl: "https://lens.example.com",
  publicKey: "pk_lens",
  secretKey: "sk_lens",
  captureMode: "safe",
};

afterAll(closeLens);

describe("lensObservability", () => {
  test("traces nothing without a setting", () => {
    expect(lensObservability()).toBeUndefined();
  });

  test("registers one lens observer as the trace of the run", () => {
    const observability = lensObservability(lens);

    expect(Object.keys(observability?.observers ?? {})).toEqual(["lens"]);
    expect(observability?.primaryTrace).toBe("lens");
    expect(typeof observability?.observers.lens?.startRun).toBe("function");
  });

  test("enables full capture mode with input and output redaction", () => {
    const observability = lensObservability({ ...lens, captureMode: "full" });

    expect(observability?.primaryTrace).toBe("lens");
    expect(typeof observability?.observers.lens?.startRun).toBe("function");
  });

  test("an address Lens refuses leaves the run untraced instead of failing it", () => {
    expect(lensObservability({ ...lens, baseUrl: "nope" })).toBeUndefined();
  });

  test("a coding agent is traced when its run carries the setting", () => {
    const base = { provider: "openai", apiKey: "test-key", tools: [] } as const;

    expect(createCodingAgent(base).agent.observability).toBeUndefined();
    expect(createCodingAgent({ ...base, lens }).agent.observability?.primaryTrace).toBe("lens");
  });
});
