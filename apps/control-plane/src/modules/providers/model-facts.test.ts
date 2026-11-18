import { describe, expect, test } from "bun:test";

import { mergeModelFacts } from "./model-facts";

const catalog = {
  effortLevels: ["low", "high", "max"],
  defaultEffort: null,
  contextWindow: 1048576,
  label: "DeepSeek V4.1 Flash",
};

describe("the facts of an openai-compatible model", () => {
  test("are the vendor's own when the address says nothing it can use", () => {
    expect(mergeModelFacts(null, catalog)).toEqual(catalog);
  });

  test("are the gateway's for what it lists, and the vendor's for what it does not", () => {
    const gateway = {
      effortLevels: ["minimal", "max"],
      effortKnown: true,
      defaultEffort: "max",
      contextWindow: null,
      label: null,
    };

    expect(mergeModelFacts(gateway, catalog)).toEqual({
      effortLevels: ["minimal", "max"],
      defaultEffort: "max",
      contextWindow: 1048576,
      label: "DeepSeek V4.1 Flash",
    });
  });

  test("take no levels from the vendor when the gateway says the model takes none", () => {
    const gateway = {
      effortLevels: null,
      effortKnown: true,
      defaultEffort: null,
      contextWindow: 8000,
      label: null,
    };

    expect(mergeModelFacts(gateway, { ...catalog, defaultEffort: "high" })).toEqual({
      effortLevels: null,
      defaultEffort: null,
      contextWindow: 8000,
      label: "DeepSeek V4.1 Flash",
    });
  });

  test("take the vendor's levels when the address only names the model", () => {
    const gateway = {
      effortLevels: null,
      effortKnown: false,
      defaultEffort: null,
      contextWindow: null,
      label: "DeepSeek-V4.1-Flash",
    };

    expect(mergeModelFacts(gateway, catalog)).toEqual({
      effortLevels: ["low", "high", "max"],
      defaultEffort: null,
      contextWindow: 1048576,
      label: "DeepSeek-V4.1-Flash",
    });
  });

  test("are nothing at all when neither source knows the model", () => {
    expect(mergeModelFacts(null, null)).toEqual({
      effortLevels: null,
      defaultEffort: null,
      contextWindow: null,
      label: null,
    });
  });
});
