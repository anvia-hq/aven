import type { useComposer } from "@anvia/react-ui/chat";
import { useEffect, useState } from "react";

import { readDraft, writeDraft } from "../drafts";
import type { useAttachments } from "./use-attachments";

type Composer = ReturnType<typeof useComposer>;

export function useComposerDraft(
  threadId: string | undefined,
  composer: Composer,
  attachments: ReturnType<typeof useAttachments>,
) {
  const [restored, setRestored] = useState(false);
  const { input, entities, setInput, setEntities } = composer;
  const { files, restored: filesRestored } = attachments;

  useEffect(() => {
    if (threadId !== undefined) {
      const draft = readDraft(threadId);

      if (draft) {
        setInput(draft.input);
        setEntities(draft.entities);
      }
    }

    setRestored(true);
  }, [threadId, setInput, setEntities]);

  useEffect(() => {
    if (threadId === undefined || !restored || !filesRestored) return;

    writeDraft(threadId, {
      input,
      entities,
      files: files.map(({ id, file }) => ({
        id,
        name: file.name,
        type: file.type,
        size: file.size,
      })),
    });
  }, [threadId, restored, filesRestored, input, entities, files]);
}
