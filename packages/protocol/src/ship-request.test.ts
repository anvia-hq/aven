import { expect, test } from "bun:test";

import { shipRequestOf, wrapShipRequest } from "./ship-request";

test("a wrapped ship prompt is read back as it was", () => {
  const prompt = "Ship it.\n\n1. Commit.\n2. Push.";
  expect(shipRequestOf(wrapShipRequest(prompt))).toBe(prompt);
});

test("any other message is not a ship request", () => {
  expect(shipRequestOf("Ship it.")).toBeNull();
  expect(shipRequestOf("please <ship_request>\nship\n</ship_request>")).toBeNull();
  expect(shipRequestOf("<ship_request>\nno end")).toBeNull();
  expect(shipRequestOf("")).toBeNull();
});
