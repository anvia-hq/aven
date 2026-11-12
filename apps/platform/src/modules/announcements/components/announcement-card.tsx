import { cn } from "cn";

import { templateBackground } from "../templates";
import type { AnnouncementTemplate } from "../types";

type Props = {
  title: string;
  summary: string;
  template: AnnouncementTemplate;
  className?: string;
};

export function AnnouncementCard({ title, summary, template, className }: Props) {
  return (
    <div
      className={cn("rounded-xl bg-cover bg-center px-4 py-3.5 text-left text-white", className)}
      style={{ backgroundImage: templateBackground(template) }}
    >
      <p className="text-base font-semibold tracking-wide uppercase">{title || "Title"}</p>
      <p className="mt-1 pr-6 text-sm text-pretty">{summary || "A short summary"}</p>
    </div>
  );
}
