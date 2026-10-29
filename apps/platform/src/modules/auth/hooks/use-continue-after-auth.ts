import { useNavigate } from "@tanstack/react-router";

import type { InvitationSearch } from "../invitation-search";

// Where to go once signed in or registered: the invitation the user came for, else the app.
export function useContinueAfterAuth({ invitation }: InvitationSearch) {
  const navigate = useNavigate();

  return () => {
    if (invitation) {
      return navigate({
        to: "/accept-invitation/$invitationId",
        params: { invitationId: invitation },
      });
    }
    return navigate({ to: "/threads" });
  };
}
