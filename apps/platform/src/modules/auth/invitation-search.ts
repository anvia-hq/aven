export type InvitationSearch = { invitation?: string };

// Login and register carry the invitation id so the user lands on the accept page afterwards.
export function validateInvitationSearch(search: Record<string, unknown>): InvitationSearch {
  const result: InvitationSearch = {};
  if (typeof search.invitation === "string") result.invitation = search.invitation;
  return result;
}
