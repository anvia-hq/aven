import { useCallback, useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";

import { toast } from "@/components/toast";

import { CAPTURE_HEIGHT, CAPTURE_WIDTH } from "../components/profile-capture-card";

const PIXEL_RATIO = 2;

export function useProfileCapture() {
  const ref = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState(false);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    const node = ref.current;

    if (!requested || !node) return;

    let live = true;
    setCapturing(true);
    toPng(node, { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, pixelRatio: PIXEL_RATIO })
      .then((dataUrl) => {
        const link = document.createElement("a");
        link.download = "aven-profile-capture.png";
        link.href = dataUrl;
        link.click();
      })
      .catch((error: unknown) => {
        toast.add({
          title: "Could not download the capture",
          description: error instanceof Error ? error.message : undefined,
          type: "error",
        });
      })
      .finally(() => {
        if (!live) return;

        setCapturing(false);
        setRequested(false);
      });

    return () => {
      live = false;
    };
  }, [requested]);

  const download = useCallback(() => {
    setRequested(true);
  }, []);

  return { ref, requested, capturing, download };
}
