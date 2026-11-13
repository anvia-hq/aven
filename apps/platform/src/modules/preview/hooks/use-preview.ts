import { useState } from "react";

import { toast } from "@/components/toast";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { errorMessage, postJson } from "@/lib/api";
import { forgetStoredKeys, registerUserState } from "@/lib/user-state";

import type { PreviewAnswer, PreviewSession } from "../types";

const PORT_KEY = "aven.preview-port";

registerUserState(() => forgetStoredKeys([PORT_KEY]));

export function usePreview(runtimeId: string) {
  const [port, setPort] = useLocalStorage(PORT_KEY, "");
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [problem, setProblem] = useState("");
  const [opening, setOpening] = useState(false);

  async function open(target: number) {
    setOpening(true);

    try {
      const answer = await postJson<PreviewAnswer>(`/runtimes/${runtimeId}/ports`, {
        port: target,
      });
      setSession((before) => ({ ...answer, port: target, key: (before?.key ?? 0) + 1 }));
      setProblem("");
    } catch (failure) {
      const message = errorMessage(failure);
      setProblem(message);
      toast.add({ title: "Could not open the preview", description: message, type: "error" });
    } finally {
      setOpening(false);
    }
  }

  return { port, setPort, session, problem, opening, open };
}
