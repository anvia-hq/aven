import { authClient } from "@/lib/auth-client";

export function useFoldersKey() {
  const { data: session } = authClient.useSession();
  return ["folders", session?.user.id ?? null] as const;
}
