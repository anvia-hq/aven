import { useNavigate } from "@tanstack/react-router";
import type { InvitationSearch } from "../types";

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
