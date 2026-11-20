import { describe, expect, test } from "bun:test";
import { createTool } from "@anvia/core";
import { z } from "zod";

import { redactingTools, REDACTED, secretRedactor } from "./secret-redaction";

const secret = (value: string, name = "KEY") => ({ name, value, secret: true });

describe("secretRedactor", () => {
  test("hides every occurrence of a secret in every string of a result, however deep", () => {
    const redact = secretRedactor([secret("sk-live-abcdef")])!;

    expect(
      redact({
        stdout: "key=sk-live-abcdef and again sk-live-abcdef",
        stderr: "",
        entries: [{ path: "x", note: "has sk-live-abcdef" }],
        exitCode: 0,
        nested: { deeper: { text: "sk-live-abcdef" } },
      }),
    ).toEqual({
      stdout: `key=${REDACTED} and again ${REDACTED}`,
      stderr: "",
      entries: [{ path: "x", note: `has ${REDACTED}` }],
      exitCode: 0,
      nested: { deeper: { text: REDACTED } },
    });
  });

  test("leaves plain variables alone, and what it has no secret to hide", () => {
    const redact = secretRedactor([
      secret("sk-live-abcdef"),
      { name: "MODE", value: "development-mode" },
    ])!;
    expect(redact("MODE=development-mode")).toBe("MODE=development-mode");
  });

  test("a secret that contains another is hidden whole", () => {
    const redact = secretRedactor([secret("password1"), secret("password12345", "LONG")])!;
    expect(redact("x password12345 y")).toBe(`x ${REDACTED} y`);
  });

  test("does not hide a secret too short to hide safely", () => {
    expect(secretRedactor([secret("short")])).toBeUndefined();
    expect(secretRedactor([secret("1234567")])).toBeUndefined();
    expect(secretRedactor([secret("12345678")])).toBeDefined();
  });

  test("has nothing to do without secrets", () => {
    expect(secretRedactor(undefined)).toBeUndefined();
    expect(secretRedactor([])).toBeUndefined();
    expect(secretRedactor([{ name: "A", value: "plain-long-value" }])).toBeUndefined();
  });

  test("bytes and other non-plain values are left as they are", () => {
    const redact = secretRedactor([secret("sk-live-abcdef")])!;
    const bytes = new Uint8Array([1, 2, 3]);
    const when = new Date(0);
    expect(redact({ bytes, when })).toEqual({ bytes, when });
    expect(redact(null)).toBeNull();
    expect(redact(42)).toBe(42);
  });
});

describe("redactingTools", () => {
  test("keep the tool's name and give back its result with the secrets hidden", async () => {
    const tool = createTool({
      name: "exec_command",
      description: "Runs a command",
      inputSchema: z.object({ command: z.string() }),
      handler: async ({ command }) => ({ stdout: `ran ${command}: sk-live-abcdef`, exitCode: 0 }),
    });
    const [wrapped] = redactingTools([tool], secretRedactor([secret("sk-live-abcdef")])!);

    expect(wrapped!.name).toBe("exec_command");
    expect(await wrapped!.call({ command: "env" } as never)).toEqual({
      stdout: `ran env: ${REDACTED}`,
      exitCode: 0,
    });
  });
});
