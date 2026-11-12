import { useCallback, useEffect, useRef, useState } from "react";

import { FRAME_LOAD_MS, FRAME_MAX_HEIGHT, FRAME_MIN_HEIGHT, THEME_VARS } from "../artifact-frame";

function themeMessage() {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const vars = Object.fromEntries(
    THEME_VARS.map((name) => [`--aven-${name}`, style.getPropertyValue(`--${name}`).trim()]),
  );
  return { aven: "theme", vars, scheme: root.classList.contains("dark") ? "dark" : "light" };
}

export function useArtifactFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(FRAME_MIN_HEIGHT);
  const [ready, setReady] = useState(false);
  const [late, setLate] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage(themeMessage(), "*");
  }, []);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;

      const data: unknown = event.data;

      if (typeof data !== "object" || data === null || !("aven" in data)) return;

      if (data.aven === "ready") {
        setReady(true);
        send();
      }

      if (data.aven === "height" && "value" in data && typeof data.value === "number") {
        setHeight(Math.min(FRAME_MAX_HEIGHT, Math.max(FRAME_MIN_HEIGHT, data.value)));
      }
    };
    addEventListener("message", listen);
    const watch = new MutationObserver(send);
    watch.observe(document.documentElement, { attributes: true });
    return () => {
      removeEventListener("message", listen);
      watch.disconnect();
    };
  }, [send]);

  useEffect(() => {
    if (ready) return;

    const timer = setTimeout(() => setLate(true), FRAME_LOAD_MS);
    return () => clearTimeout(timer);
  }, [ready, attempt]);

  const retry = () => {
    setLate(false);
    setReady(false);
    setAttempt((count) => count + 1);
  };

  return { frame, height, ready, failed: late && !ready, attempt, retry };
}
