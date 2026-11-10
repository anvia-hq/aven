import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
import { initials } from "@/lib/format";

import type { Crowd } from "../types";

export function ParticipantStack({ crowd }: { crowd: Crowd }) {
  return (
    <span
      role="img"
      aria-label={`In this thread: ${crowd.names.join(", ")}`}
      title={crowd.names.join(", ")}
      className="mr-1 flex shrink-0 items-center rounded-full border border-foreground/10 bg-(--capsule) p-0.5 [--capsule:color-mix(in_oklch,var(--sidebar),var(--foreground)_8%)] group-hover/menu-button:[--capsule:color-mix(in_oklch,var(--sidebar-accent),var(--foreground)_8%)] group-data-active/menu-button:[--capsule:color-mix(in_oklch,var(--sidebar-accent),var(--foreground)_8%)]"
      data-role="participants"
    >
      {crowd.shown.map((person) => (
        <Avatar
          key={person.id}
          className="size-[18px] ring-[1.5px] ring-(--capsule) not-first:-ml-1"
        >
          {person.image && <AvatarImage src={person.image} alt="" />}
          <AvatarFallback className="bg-[color-mix(in_oklch,var(--capsule),var(--foreground)_16%)] text-[8px] font-medium text-sidebar-foreground">
            {initials(person.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {crowd.more > 0 && (
        <span className="pr-1 pl-1 text-[9px] font-medium text-sidebar-foreground tabular-nums">
          {crowd.more}+
        </span>
      )}
    </span>
  );
}
