import { X } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/dialog";
import { Markdown } from "@/components/markdown";

import { useActiveAnnouncement } from "../hooks/use-active-announcement";
import { templateBackground } from "../templates";
import { AnnouncementCard } from "./announcement-card";

export function AnnouncementBanner() {
  const { announcement, dismiss } = useActiveAnnouncement();
  const [open, setOpen] = useState(false);

  if (!announcement) return null;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        aria-label={`${announcement.title}: open details`}
        className="block h-auto w-full rounded-xl p-0 whitespace-normal"
        onClick={() => setOpen(true)}
      >
        <AnnouncementCard
          title={announcement.title}
          summary={announcement.summary}
          template={announcement.template}
        />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss announcement"
        className="absolute top-1.5 right-1.5 text-white hover:bg-white/15 hover:text-white"
        onClick={() => dismiss(announcement.id)}
      >
        <X />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md" showCloseButton={false}>
          <div
            className="flex h-32 items-end bg-cover bg-center p-4 text-white"
            style={{ backgroundImage: templateBackground(announcement.template) }}
          >
            <DialogTitle className="text-lg font-semibold tracking-wide uppercase">
              {announcement.title}
            </DialogTitle>
          </div>
          <div className="flex flex-col gap-3 p-4">
            <DialogDescription className="text-sm text-foreground">
              {announcement.summary}
            </DialogDescription>
            {announcement.details && <Markdown>{announcement.details}</Markdown>}
          </div>
          <DialogFooter className="m-0 rounded-none border-t p-3">
            <Button
              variant="outline"
              onClick={() => {
                dismiss(announcement.id);
                setOpen(false);
              }}
            >
              Dismiss
            </Button>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
