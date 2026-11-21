import type { useComposer } from "@anvia/react-ui/chat";
import { useState } from "react";

import { toast } from "@aven/ui/toast";
import type { useAttachments } from "@/modules/threads/hooks/use-attachments";
import type { AttachmentUpload } from "@/modules/threads/types";

export function useBotSendComposer({
  composer,
  attachments,
  onSend,
}: {
  composer: ReturnType<typeof useComposer>;
  attachments: ReturnType<typeof useAttachments>;
  onSend: (text: string, files: AttachmentUpload[]) => Promise<boolean>;
}) {
  const [sending, setSending] = useState(false);
  const message = composer.input.trim();
  const canSend = (message.length > 0 || attachments.files.length > 0) && !sending;

  async function submit() {
    if (!canSend) return;

    setSending(true);
    try {
      const files = await attachments.encode();

      if (await onSend(message, files)) {
        composer.setInput("");
        composer.setEntities([]);
        attachments.clear();
      }
    } catch (error) {
      toast.add({
        title: "Could not read the attached files",
        description: error instanceof Error ? error.message : undefined,
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  return { canSend, submit };
}
