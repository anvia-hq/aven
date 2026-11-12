import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import type { InvitationSearch } from "../types";

export function useGithubSignIn({ invitation }: InvitationSearch) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    const encoded = invitation ? encodeURIComponent(invitation) : null;
    const callbackURL = encoded ? `/accept-invitation/${encoded}` : "/threads";
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL,
      errorCallbackURL: encoded ? `/login?invitation=${encoded}` : "/login",
    });

    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Something went wrong");
    }
  }

  return { error, pending, signIn };
}
