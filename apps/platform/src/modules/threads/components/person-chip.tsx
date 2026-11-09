import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar";
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
      className="inline-flex h-fit items-center gap-1 rounded bg-primary/10 px-1 py-0.5 align-middle text-[0.85em] leading-none font-medium text-primary"
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
      className="inline-flex h-fit items-center rounded bg-primary/10 px-1 py-0.5 align-middle text-[0.85em] leading-none font-medium text-primary"
      title={`Mentions ${name}`}
      data-mention="person"
    >
      @{name}
    </span>
  );
}
