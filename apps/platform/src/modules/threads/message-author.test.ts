import { describe, expect, test } from "bun:test";

import { driverPrompt, ownPrompt } from "@aven/protocol/drivers";

import { authorOf } from "./message-author";

const owner = { owned: true, name: "Indra", ownerName: "Indra" };
const randy = { owned: false, name: "Randy Pamungkas", ownerName: "Indra" };

describe("whose a message in a multiplayer thread is", () => {
  test("the creator sees their own words as theirs and a teammate's as the teammate's", () => {
    expect(authorOf(ownPrompt("fix it"), owner)).toEqual({
      mine: true,
      name: "Indra",
      text: "fix it",
    });
    expect(authorOf(driverPrompt("Randy Pamungkas", "thanks"), owner)).toEqual({
      mine: false,
      name: "Randy Pamungkas",
      text: "thanks",
    });
  });

  test("a teammate sees their own words as theirs and the creator's as the creator's", () => {
    expect(authorOf(driverPrompt("Randy Pamungkas", "thanks"), randy).mine).toBe(true);
    expect(authorOf(ownPrompt("fix it"), randy)).toEqual({
      mine: false,
      name: "Indra",
      text: "fix it",
    });
  });

  test("a third person's words are neither's", () => {
    expect(authorOf(driverPrompt("Dina", "hi"), randy)).toEqual({
      mine: false,
      name: "Dina",
      text: "hi",
    });
  });

  test("a name the wire would change is still recognised as the person's own", () => {
    const odd = { owned: false, name: "Randy ] P\nK", ownerName: "Indra" };
    expect(authorOf(driverPrompt(odd.name, "yo"), odd).mine).toBe(true);
  });
});
