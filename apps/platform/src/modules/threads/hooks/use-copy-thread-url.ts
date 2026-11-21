import { copyToClipboard } from "@aven/ui/clipboard";
import { toast } from "@aven/ui/toast";

export function useCopyThreadUrl() {
  async function copyThreadUrl(threadId: string) {
    const copied = await copyToClipboard(`${window.location.origin}/threads/${threadId}`);
    toast.add(
      copied
        ? { title: "Thread URL copied", type: "success" }
        : { title: "Could not copy the thread URL", type: "error" },
    );
  }

  return { copyThreadUrl };
}
