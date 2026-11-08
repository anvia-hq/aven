import { describe, expect, test } from "bun:test";

import { PROVIDERS } from "./runtime-wire";

const wireProviders = [...PROVIDERS].sort();

const sourceOf = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

const sorted = (values: string[]) => [...new Set(values)].sort();

async function databaseProviders() {
  const source = await sourceOf("../../db/src/schema/providers.ts");
  const kinds = /enum:\s*\[([^\]]*)\]/.exec(source)?.[1] ?? "";
  return sorted([...kinds.matchAll(/"([^"]+)"/g)].map((match) => match[1]));
}

async function modelProviders() {
  const source = await sourceOf("../../agents/src/model.ts");
  const branches = [...source.matchAll(/config\.provider === "([^"]+)"/g)].map((match) => match[1]);
  return sorted(branches);
}

describe("the providers the code knows", () => {
  test("the database kind enum is exactly the wire's providers", async () => {
    expect(await databaseProviders()).toEqual(wireProviders);
  });

  test("the model has a branch for each wire provider, and for no other", async () => {
    expect(await modelProviders()).toEqual(wireProviders);
  });
});
