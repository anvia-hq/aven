import { redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import type { InvitationSearch } from "./types";

export async function redirectIfSignedIn({ invitation }: InvitationSearch) {
  const { data } = await authClient.getSession();
  if (!data) return;
  if (invitation) {
    throw redirect({
      to: "/accept-invitation/$invitationId",
      params: { invitationId: invitation },
    });
  }
  throw redirect({ to: "/threads" });
}
