import { describe, expect, test } from "bun:test";

import { sameSpeaker, spaceBefore, speakerOf } from "./message-spacing";
import type { ChatMessage, Speaker, Viewer } from "./types";

const viewer = {
  id: "u-1",
  name: "Indra",
  owned: true,
  ownerId: "u-1",
  ownerName: "Indra",
} as Viewer;
const said = (role: "user" | "assistant", text: string, senderId?: string) =>
  ({ id: text, role, parts: [{ type: "text", text }], senderId }) as ChatMessage;

const me: Speaker = { kind: "person", key: "me", mine: true };
const randy: Speaker = { kind: "person", key: "Randy", mine: false };
const agent: Speaker = { kind: "agent" };

describe("the space between messages", () => {
  test("a person's own bubbles sit almost together", () => {
    expect(spaceBefore(me, me)).toBe("mt-1");
    expect(spaceBefore(randy, randy)).toBe("mt-1");
  });

  test("the agent and anyone are 64px apart, either way", () => {
    expect(spaceBefore(agent, me)).toBe("mt-16");
    expect(spaceBefore(randy, agent)).toBe("mt-16");
  });

  test("two different people, or two agent messages, keep the usual gap, and the first has none", () => {
    expect(spaceBefore(me, randy)).toBe("mt-4");
    expect(spaceBefore(agent, agent)).toBe("mt-4");
    expect(spaceBefore(null, me)).toBe("");
  });
});

describe("who is speaking", () => {
  test("is told from the role, the sender and the viewer", () => {
    expect(speakerOf(said("assistant", "hi"), viewer)).toEqual(agent);
    expect(speakerOf(said("user", "hello", "u-1"), viewer)).toEqual(me);
    expect(speakerOf(said("user", "[driver: Randy] hey", "u-2"), viewer)).toEqual(randy);
    expect(speakerOf(said("user", "mine", "u-2"), viewer, true)).toEqual(me);
  });

  test("a hidden message speaks for nobody, and a note is the agent's", () => {
    expect(speakerOf(said("user", "[process] a task ended"), viewer)).toBeNull();
    expect(speakerOf(said("user", "[fork] forked"), viewer)).toEqual(agent);
    expect(speakerOf({ ...said("assistant", ""), parts: [] }, viewer)).toBeNull();
  });

  test("the same person is found again by key", () => {
    expect(sameSpeaker(randy, { ...randy })).toBe(true);
    expect(sameSpeaker(me, randy)).toBe(false);
    expect(sameSpeaker(agent, agent)).toBe(false);
  });
});
