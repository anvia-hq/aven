import { useState } from "react";

import { toast } from "@/components/toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { attempt, postJson } from "@/lib/api";
import { forgetStoredKeys, registerUserState } from "@/lib/user-state";

import { parsePort } from "../port";
import type { BrowserSession } from "../types";

const PORT_KEY = "aven.browser-port";

registerUserState(() => forgetStoredKeys([PORT_KEY]));

export function useBrowser(threadId: string) {
  const [port, setPort] = useLocalStorage(PORT_KEY, "");
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [opening, setOpening] = useState(false);

  async function open() {
    const parsed = parsePort(port);
    if (parsed === null) {
      toast.add({ title: "Enter a port between 1 and 65535", type: "error" });
      return;
    }
    setOpening(true);
    const answer = await attempt("Could not open the Browser", () =>
      postJson<{ url: string }>(`/threads/${threadId}/browser`, { port: parsed }),
    );
    if (answer) setSession((before) => ({ url: answer.url, key: (before?.key ?? 0) + 1 }));
    setOpening(false);
  }

  return { port, setPort, session, opening, open };
}
