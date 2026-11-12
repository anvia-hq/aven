import { useAtom } from "jotai";

import { useRequest } from "@/hooks/use-request";

import { dismissedAnnouncementsAtom } from "../atoms/dismissed-announcements-atom";
import type { Announcement } from "../types";

export function useActiveAnnouncement() {
  const answer = useRequest<Announcement | null>("/announcements/active");
  const [dismissed, setDismissed] = useAtom(dismissedAnnouncementsAtom);
  const announcement = answer?.data ?? null;
  const visible = announcement && !dismissed.includes(announcement.id) ? announcement : null;

  function dismiss(id: string) {
    setDismissed((current) => [...current.filter((entry) => entry !== id), id].slice(-20));
  }

  return { announcement: visible, dismiss };
}
