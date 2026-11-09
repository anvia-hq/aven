import { describe, expect, test } from "bun:test";

import { driverPrompt, ownPrompt } from "@aven/protocol/drivers";

import { authorOf } from "./message-author";

const owner = { id: "u-indra", owned: true, name: "Indra", ownerId: "u-indra", ownerName: "Indra" };
const randy = {
  id: "u-randy",
  owned: false,
  name: "Randy Pamungkas",
  ownerId: "u-indra",
  ownerName: "Indra",
};

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
    const odd = { ...randy, name: "Randy ] P\nK" };
    expect(authorOf(driverPrompt(odd.name, "yo"), odd).mine).toBe(true);
  });

  test("a sender id decides whose it is, whatever the names", () => {
    const same = { ...randy, name: "Indra" };
    const fromOwner = authorOf(ownPrompt("fix it"), same, "u-indra");
    expect(fromOwner).toEqual({ mine: false, name: "Indra", text: "fix it" });
    const fromMe = authorOf(driverPrompt("Indra", "hi"), same, "u-randy");
    expect(fromMe.mine).toBe(true);
    const fromThird = authorOf(driverPrompt("Dina", "hi"), randy, "u-dina");
    expect(fromThird).toEqual({ mine: false, name: "Dina", text: "hi" });
    expect(authorOf(driverPrompt("Dina", "hi"), owner, "u-dina").mine).toBe(false);
    expect(authorOf("hello", owner, "u-indra").mine).toBe(true);
  });
});
