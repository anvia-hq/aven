import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { initials } from "@/lib/format";

import type { Crowd } from "../types";

export function ParticipantStack({ crowd }: { crowd: Crowd }) {
  return (
    <span
      role="img"
      aria-label={`In this thread: ${crowd.names.join(", ")}`}
      title={crowd.names.join(", ")}
      className="mr-1 flex shrink-0 items-center -space-x-1"
      data-role="participants"
    >
      {crowd.shown.map((person) => (
        <Avatar
          key={person.id}
          className="size-5 ring-2 ring-sidebar group-hover/menu-button:ring-sidebar-accent group-data-active/menu-button:ring-sidebar-accent"
        >
          {person.image && <AvatarImage src={person.image} alt="" />}
          <AvatarFallback className="bg-foreground/10 text-[9px] font-medium text-sidebar-foreground">
            {initials(person.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {crowd.more > 0 && (
        <span className="z-10 grid h-5 min-w-5 place-items-center rounded-full bg-foreground/10 px-1 text-[9px] font-medium text-sidebar-foreground ring-2 ring-sidebar group-hover/menu-button:ring-sidebar-accent group-data-active/menu-button:ring-sidebar-accent">
          {crowd.more}+
        </span>
      )}
    </span>
  );
}
