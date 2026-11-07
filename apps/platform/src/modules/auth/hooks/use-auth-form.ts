import { useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth-client";
import { resetPlatformConfig } from "@/modules/platform/hooks/use-platform-config";

type AuthMode = "sign-in" | "sign-up";

export function useAuthForm(mode: AuthMode, onSuccess: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    setError(null);
    setPending(true);
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")) })
        : await authClient.signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    resetPlatformConfig();
    onSuccess();
  }

  return { error, pending, submit };
}
