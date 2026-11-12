import { useCallback, useEffect, useState } from "react";

import { api, attempt, postJson } from "@/lib/api";

import type { NoticeId } from "../types";

export function useNotice(id: NoticeId) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let current = true;
    api<{ dismissedNotices: string[] }>("/preferences")
      .then((preferences) => current && setVisible(!preferences.dismissedNotices.includes(id)))
      .catch(() => undefined);
    return () => void (current = false);
  }, [id]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    const done = await attempt("Could not dismiss the notice", () =>
      postJson(`/preferences/notices/${id}/dismiss`, {}),
    );

    if (!done) setVisible(true);
  }, [id]);

  return { visible, dismiss };
}
