import { useState } from "react";

import { toast } from "@/components/toast";
import { useRequest } from "@/hooks/use-request";
import { api, attempt, postJson } from "@/lib/api";

import type { Announcement, AnnouncementDraft } from "../types";

export function useAnnouncements() {
  const [refreshKey, setRefreshKey] = useState(0);
  const answer = useRequest<Announcement[]>("/announcements", { refreshKey });

  async function save(id: string | null, draft: AnnouncementDraft) {
    const saved = await attempt("Could not save the announcement", () =>
      id
        ? postJson<Announcement>(`/announcements/${id}`, draft, "PATCH")
        : postJson<Announcement>("/announcements", draft),
    );

    if (!saved) return false;

    toast.add({ title: id ? "Announcement updated" : "Announcement created", type: "success" });
    setRefreshKey((key) => key + 1);
    return true;
  }

  async function setActive(announcement: Announcement, active: boolean) {
    const saved = await attempt("Could not update the announcement", () =>
      postJson<Announcement>(`/announcements/${announcement.id}`, { active }, "PATCH"),
    );

    if (saved) setRefreshKey((key) => key + 1);
  }

  async function remove(announcement: Announcement) {
    const removed = await attempt("Could not delete the announcement", () =>
      api<{ removed: true }>(`/announcements/${announcement.id}`, { method: "DELETE" }),
    );

    if (!removed) return;

    toast.add({ title: "Announcement deleted", type: "success" });
    setRefreshKey((key) => key + 1);
  }

  return {
    announcements: answer?.data ?? null,
    error: answer?.error ?? null,
    save,
    setActive,
    remove,
  };
}
