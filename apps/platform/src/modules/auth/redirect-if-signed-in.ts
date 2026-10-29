import { redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

import type { InvitationSearch } from "./invitation-search";

// For the login and register routes' `beforeLoad`: someone already signed in has no use for them,
// so send them on to the invitation they came for, else to the app.
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
