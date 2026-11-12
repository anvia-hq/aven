import { useCallback, useEffect, useSyncExternalStore } from "react";

import { api, attempt, postJson } from "@/lib/api";
import { registerUserState } from "@/lib/user-state";

import type { NoticeId } from "../types";

let dismissed: ReadonlySet<string> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const change = (next: ReadonlySet<string> | null) => {
  dismissed = next;
  for (const listener of listeners) listener();
};

registerUserState(() => {
  loading = null;
  change(null);
});

function load() {
  loading ??= api<{ dismissedNotices: string[] }>("/preferences")
    .then((preferences) => change(new Set(preferences.dismissedNotices)))
    .catch(() => {
      loading = null;
    });
  return loading;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const read = () => dismissed;

export function useNotice(id: NoticeId) {
  const known = useSyncExternalStore(subscribe, read);

  useEffect(() => {
    if (known === null) void load();
  }, [known]);

  const dismiss = useCallback(async () => {
    const before = dismissed ?? new Set<string>();
    change(new Set([...before, id]));
    const done = await attempt("Could not dismiss the notice", () =>
      postJson(`/preferences/notices/${id}/dismiss`, {}),
    );

    if (!done) change(before);
  }, [id]);

  return { visible: known !== null && !known.has(id), dismiss };
}
