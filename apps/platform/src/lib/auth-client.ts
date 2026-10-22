import { createAuthClient } from "better-auth/react";

// The backend sits behind the `/api` proxy, which strips the prefix.
export const authClient = createAuthClient({
  baseURL: `${window.location.origin}/api/auth`,
});
