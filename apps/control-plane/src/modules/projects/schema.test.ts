import { describe, expect, test } from "bun:test";

import { importProjectBody } from "./schema";

const body = (repository: string) => ({
  installationId: crypto.randomUUID(),
  repository,
  runtimeId: crypto.randomUUID(),
});

describe("importProjectBody", () => {
  test("accepts owner/name", () => {
    expect(importProjectBody.safeParse(body("acme/web.app-2")).success).toBe(true);
  });

  test.each(["web", "acme/web/extra", "../..", "acme/..", "./web", "acme/web?x=1", "a b/c"])(
    "refuses %p",
    (repository) => {
      expect(importProjectBody.safeParse(body(repository)).success).toBe(false);
    },
  );
});
