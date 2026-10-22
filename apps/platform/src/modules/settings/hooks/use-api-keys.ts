import { useAtom } from "jotai";

import { toast } from "@/components/toast";

import { apiKeysAtom } from "../atoms/api-keys-atom";

const randomKey = () =>
  `avn_${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

export function useApiKeys() {
  const [keys, setKeys] = useAtom(apiKeysAtom);

  // Returns the full secret; only its prefix is kept in state, as a real service would.
  function create(name: string) {
    const secret = randomKey();
    setKeys((all) => [
      {
        id: `k-${Math.random().toString(36).slice(2, 8)}`,
        name,
        prefix: `${secret.slice(0, 8)}…${secret.slice(-4)}`,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      },
      ...all,
    ]);
    return secret;
  }

  function revoke(id: string, name: string) {
    setKeys((all) => all.filter((key) => key.id !== id));
    toast.add({ title: "Key revoked", description: name });
  }

  return { keys, create, revoke };
}
