import { describe, expect, test } from "bun:test";

import { communityEdition } from "./community";

describe("communityEdition", () => {
  test("is named, mounts no routes and has no features or management page", () => {
    expect(communityEdition.name).toBe("community");
    expect(communityEdition.routes).toEqual([]);
    expect(communityEdition.features).toEqual([]);
    expect(communityEdition.manageUrl).toBeNull();
  });
});
