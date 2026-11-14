import { Sparkles } from "@mynaui/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@aven/ui/avatar";
import { initials } from "@/lib/format";

import type { MentionPerson } from "../types";

export function PersonAvatar({ name, image }: Pick<MentionPerson, "name" | "image">) {
  return (
    <Avatar size="sm" className="size-5">
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

export function PersonChip({ name, image }: Pick<MentionPerson, "name" | "image">) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      title={`Mentions ${name}`}
      data-mention="person"
    >
      <PersonAvatar name={name} image={image} />
      {name}
    </span>
  );
}

export function SentPersonMention({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      title={`Mentions ${name}`}
      data-mention="person"
    >
      @{name}
    </span>
  );
}

export function AgentChip() {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 rounded bg-primary/10 px-1 py-0.5 align-middle text-[0.85em] leading-none font-medium text-primary"
      title="Asks the agent"
      data-mention="agent"
    >
      <Sparkles className="size-3.5" />
      agent
    </span>
  );
}
