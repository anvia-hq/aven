import type { InvitationSearch } from "./types";

export function validateInvitationSearch(search: Record<string, unknown>): InvitationSearch {
  const result: InvitationSearch = {};

  if (typeof search.invitation === "string") result.invitation = search.invitation;

  return result;
}
