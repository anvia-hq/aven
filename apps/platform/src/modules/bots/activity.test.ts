import { describe, expect, test } from "bun:test";

import { activitySummary, chatItems } from "./activity";
import type { BotChatMessage } from "./types";

const said = (id: number, text: string, peer?: BotChatMessage["peer"]): BotChatMessage => ({
  id: `m-${id}`,
  role: peer?.direction === "from" || !peer ? "user" : "bot",
  text,
  peer,
});
const to = (name: string) => ({ name, direction: "to" as const });
const from = (name: string) => ({ name, direction: "from" as const });

describe("chatItems", () => {
  test("messages with a person stay messages, in order", () => {
    const items = chatItems([said(0, "hi"), said(1, "hello")]);
    expect(items.map((item) => item.type)).toEqual(["message", "message"]);
  });

  test("messages between bots that follow one another are one line, between those with the person", () => {
    const items = chatItems([
      said(0, "ask Scout to do A"),
      said(1, "do A", to("Scout")),
      said(2, "A is done", from("Scout")),
      said(3, "Scout did A"),
    ]);

    expect(items.map((item) => item.type)).toEqual(["message", "activity", "message"]);
    expect(items[1]).toMatchObject({ type: "activity" });
    expect(items[1]!.type === "activity" && items[1].messages.map((m) => m.text)).toEqual([
      "do A",
      "A is done",
    ]);
  });

  test("a message with the person between two lines keeps them apart", () => {
    const items = chatItems([said(0, "x", to("A")), said(1, "hi"), said(2, "y", to("B"))]);
    expect(items.map((item) => item.type)).toEqual(["activity", "message", "activity"]);
  });
});

describe("activitySummary", () => {
  test("one message reads as Messaged when this bot wrote it, and Heard from when the other did", () => {
    expect(activitySummary([said(0, "do A", to("Scout"))])).toEqual({
      lead: "Messaged",
      peers: [to("Scout")],
    });
    expect(activitySummary([said(0, "do A", from("Aven"))])).toEqual({
      lead: "Heard from",
      peers: [from("Aven")],
    });
  });

  test("an exchange counts its messages and the distinct bots, by id when it is known and by name when not", () => {
    const summary = activitySummary([
      said(0, "a", { id: "b1", name: "Scout", direction: "to" }),
      said(1, "b", { id: "b1", name: "Scout", direction: "from" }),
      said(2, "c", to("Ana")),
      said(3, "d", from("Ana")),
    ]);
    expect(summary.lead).toBe("4 messages with");
    expect(summary.peers.map((peer) => peer.name)).toEqual(["Scout", "Ana"]);
  });
});
