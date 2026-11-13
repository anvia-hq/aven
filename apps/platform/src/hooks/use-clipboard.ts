import { useEffect, useRef, useState } from "react";

import { toast } from "@aven/ui/toast";
import { copyToClipboard } from "@/lib/clipboard";

const COPIED_MS = 2000;

export function useClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(text: string) {
    if (!(await copyToClipboard(text))) {
      toast.add({ title: "Could not copy to the clipboard", type: "error" });
      return;
    }

    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return { copied, copy };
}
