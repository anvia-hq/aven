import { useRef } from "react";

import { toast } from "@aven/ui/toast";

import { request } from "@/lib/api";

import { exportFileName } from "../export-formats";
import type { Thread, ThreadExportFormat } from "../types";

export function useExportThread() {
  const busy = useRef(false);

  return {
    async exportThread(thread: Thread, format: ThreadExportFormat) {
      if (format === "pdf") {
        window.open(`/api/threads/${thread.id}/export?format=html`, "_blank");
        return;
      }

      if (busy.current) return;

      busy.current = true;

      try {
        const response = await request(`/threads/${thread.id}/export?format=${format}`);

        if (!response.ok) throw new Error("Could not export the thread");

        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = exportFileName(thread.title, format);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        toast.add({ title: "Thread exported", description: thread.title, type: "success" });
      } catch (failure) {
        toast.add({
          title: "Could not export the thread",
          description: failure instanceof Error ? failure.message : undefined,
          type: "error",
        });
      } finally {
        busy.current = false;
      }
    },
  };
}
