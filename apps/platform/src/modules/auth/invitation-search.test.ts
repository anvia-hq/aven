import { describe, expect, test } from "bun:test";

import { validateInvitationSearch } from "./invitation-search";

describe("validateInvitationSearch", () => {
  test("preserves invitation and OAuth error search params while dropping unknown keys", () => {
    expect(
      validateInvitationSearch({
        invitation: "inv-123",
        error: "registration_closed",
        ignored: "value",
      }),
    ).toEqual({
      invitation: "inv-123",
      error: "registration_closed",
    });

    expect(validateInvitationSearch({ error: "   " })).toEqual({});
  });
});
