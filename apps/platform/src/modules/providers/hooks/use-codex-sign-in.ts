import { useEffect, useRef, useState } from "react";

import { toast } from "@aven/ui/toast";
import { errorMessage, postJson } from "@/lib/api";

import type { CodexDeviceCode, CodexSignInState, Provider } from "../types";
import { useProviders } from "./use-providers";

type Polled = { status: "pending" } | { status: "done"; provider: Provider };

const GIVE_UP_MS = 15 * 60_000;

export function useCodexSignIn(
  provider: Provider | undefined,
  modelId: string,
  onDone: () => void,
) {
  const [state, setState] = useState<CodexSignInState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const attempt = useRef(0);
  const latestModel = useRef(modelId);
  latestModel.current = modelId;
  const { refresh } = useProviders();

  const stop = () => {
    clearTimeout(timer.current);
    attempt.current += 1;
  };

  useEffect(() => stop, []);

  async function poll(code: CodexDeviceCode, mine: number, startedAt: number) {
    if (mine !== attempt.current) return;

    if (Date.now() - startedAt > GIVE_UP_MS) {
      setState({ status: "failed", error: "The code expired. Start again." });
      return;
    }

    try {
      const polled = await postJson<Polled>("/providers/codex-device/poll", {
        deviceAuthId: code.deviceAuthId,
        userCode: code.userCode,
        providerId: provider?.id,
        modelId: latestModel.current || undefined,
      });

      if (mine !== attempt.current) return;

      if (polled.status === "done") {
        setState({ status: "idle" });
        await refresh();
        toast.add({ title: "Signed in with ChatGPT", description: "Codex", type: "success" });
        onDone();
        return;
      }
    } catch (failure) {
      if (mine !== attempt.current) return;

      setState({ status: "failed", error: errorMessage(failure) });
      return;
    }

    timer.current = setTimeout(() => void poll(code, mine, startedAt), code.intervalSeconds * 1000);
  }

  async function start() {
    stop();
    const mine = attempt.current;
    setState({ status: "starting" });
    try {
      const code = await postJson<CodexDeviceCode>("/providers/codex-device", {});

      if (mine !== attempt.current) return;

      setState({ status: "waiting", code });
      timer.current = setTimeout(
        () => void poll(code, mine, Date.now()),
        code.intervalSeconds * 1000,
      );
    } catch (failure) {
      if (mine === attempt.current) setState({ status: "failed", error: errorMessage(failure) });
    }
  }

  function cancel() {
    stop();
    setState({ status: "idle" });
  }

  return { state, start, cancel };
}
