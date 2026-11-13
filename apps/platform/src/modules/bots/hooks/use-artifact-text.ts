import { useEffect, useState } from "react";

import type { ArtifactTextState } from "../types";

export function useArtifactText(src: string, enabled: boolean, attempt: number): ArtifactTextState {
  const [state, setState] = useState<ArtifactTextState>({ status: "loading" });

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(src, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));

        setState({ status: "ready", text: await response.text() });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "failed" });
      });
    return () => controller.abort();
  }, [src, enabled, attempt]);

  return state;
}
