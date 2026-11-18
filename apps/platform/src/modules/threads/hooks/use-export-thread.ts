import { useRef } from "react";

import { toast } from "@aven/ui/toast";

import { request } from "@/lib/api";

import type { Thread } from "../types";

function fileStem(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "thread"
  );
}

export function useExportThread() {
  const busy = useRef(false);

  return {
    async exportThread(thread: Thread) {
      if (busy.current) return;

      busy.current = true;

      try {
        const response = await request(`/threads/${thread.id}/export`);

        if (!response.ok) throw new Error("Could not export the thread");

        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fileStem(thread.title)}.md`;
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
