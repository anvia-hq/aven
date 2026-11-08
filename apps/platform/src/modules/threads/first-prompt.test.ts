import { afterEach, beforeEach, expect, setSystemTime, spyOn, test, type Mock } from "bun:test";

import { toast } from "@/components/toast";

import {
  FIRST_PROMPT_LIFETIME_MS,
  FIRST_PROMPT_LIMIT,
  handOverFirstPrompt,
  takeFirstPrompt,
} from "./first-prompt";
import type { OutgoingMessage } from "./types";

const START = Date.parse("2025-01-01T09:00:00Z");

const handed: string[] = [];
let reports: Mock<typeof toast.add>;

const message = (prompt: string): OutgoingMessage => ({ prompt, attachments: [], mentions: [] });

function handOver(prompt: string) {
  const threadId = `thread-for-${prompt}`;
  handed.push(threadId);
  handOverFirstPrompt(threadId, message(prompt), { modelId: "a-model" });
  return threadId;
}

function advance(ms: number) {
  setSystemTime(new Date(Date.now() + ms));
}

beforeEach(() => {
  setSystemTime(new Date(START));
  reports = spyOn(toast, "add");
});

afterEach(() => {
  for (const threadId of handed.splice(0)) takeFirstPrompt(threadId);
  reports.mockRestore();
  setSystemTime();
});

test("the thread page takes a handed over prompt once, as it was given", () => {
  const threadId = handOver("Fix the failing test");
  expect(takeFirstPrompt(threadId)).toMatchObject({
    message: { prompt: "Fix the failing test" },
    selection: { modelId: "a-model" },
  });
  expect(takeFirstPrompt(threadId)).toBeUndefined();
  expect(reports).not.toHaveBeenCalled();
});

test("a prompt handed over just before its lifetime runs out is still taken", () => {
  const threadId = handOver("Fix the failing test");
  advance(FIRST_PROMPT_LIFETIME_MS - 1);
  expect(takeFirstPrompt(threadId)?.message.prompt).toBe("Fix the failing test");
  expect(reports).not.toHaveBeenCalled();
});

test("a prompt taken after its lifetime has run out is dropped and reported", () => {
  const threadId = handOver("Fix the failing test");
  advance(FIRST_PROMPT_LIFETIME_MS);
  expect(takeFirstPrompt(threadId)).toBeUndefined();
  expect(reports).toHaveBeenCalledTimes(1);
  expect(reports.mock.calls[0]?.[0]).toMatchObject({
    title: "Your first prompt was not sent",
    description: "Fix the failing test",
    type: "error",
  });
});

test("handing over a prompt drops and reports the ones that ran out", () => {
  const stale = handOver("Open the old one");
  advance(FIRST_PROMPT_LIFETIME_MS + 1);
  const fresh = handOver("Open the new one");
  expect(takeFirstPrompt(stale)).toBeUndefined();
  expect(takeFirstPrompt(fresh)?.message.prompt).toBe("Open the new one");
  expect(reports).toHaveBeenCalledTimes(1);
  expect(reports.mock.calls[0]?.[0]).toMatchObject({ description: "Open the old one" });
});

test("only the latest prompts are kept and the oldest is dropped and reported", () => {
  const threadIds = Array.from({ length: FIRST_PROMPT_LIMIT + 1 }, (_, index) =>
    handOver(`prompt ${index}`),
  );
  expect(takeFirstPrompt(threadIds[0])).toBeUndefined();
  expect(reports).toHaveBeenCalledTimes(1);
  expect(reports.mock.calls[0]?.[0]).toMatchObject({ description: "prompt 0" });
  expect(takeFirstPrompt(threadIds[FIRST_PROMPT_LIMIT])?.message.prompt).toBe(
    `prompt ${FIRST_PROMPT_LIMIT}`,
  );
  expect(reports).toHaveBeenCalledTimes(1);
});
