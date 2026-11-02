import { describe, expect, test } from "bun:test";

import { isOwnerOrAdminRole } from "./member-role";

describe("isOwnerOrAdminRole", () => {
  test.each(["owner", "admin", "member,admin", "member, owner", " admin "])(
    "is true for %p",
    (role) => {
      expect(isOwnerOrAdminRole(role)).toBe(true);
    },
  );

  test.each(["member", "", "administrator", "owners", "co-owner"])("is false for %p", (role) => {
    expect(isOwnerOrAdminRole(role)).toBe(false);
  });

  test("is false until the member is known", () => {
    expect(isOwnerOrAdminRole(undefined)).toBe(false);
  });
});
