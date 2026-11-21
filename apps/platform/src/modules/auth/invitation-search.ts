import type { InvitationSearch } from "./types";

export function validateInvitationSearch(search: Record<string, unknown>): InvitationSearch {
  const result: InvitationSearch = {};

  if (typeof search.invitation === "string") result.invitation = search.invitation;

  if (typeof search.error === "string" && search.error.trim().length > 0) {
    result.error = search.error;
  }

  return result;
}
