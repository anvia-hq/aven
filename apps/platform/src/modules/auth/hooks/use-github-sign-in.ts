import { useState } from "react";

import { authClient } from "@/lib/auth-client";

import type { InvitationSearch } from "../types";

export function useGithubSignIn({ invitation }: InvitationSearch) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn() {
    setError(null);
    setPending(true);
    const callbackURL = invitation ? `/accept-invitation/${invitation}` : "/threads";
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL,
      errorCallbackURL: invitation ? `/login?invitation=${invitation}` : "/login",
    });

    if (result.error) {
      setPending(false);
      setError(result.error.message ?? "Something went wrong");
    }
  }

  return { error, pending, signIn };
}
