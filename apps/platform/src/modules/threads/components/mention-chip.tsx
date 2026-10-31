import { BookOpen, File } from "@mynaui/icons-react";

import type { Mentionable } from "../mentions";

/** A file or a skill the user mentioned, as its token is shown in the composer and the thread. */
export function MentionChip({ type, name }: Mentionable) {
  const Icon = type === "file" ? File : BookOpen;
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      title={type === "file" ? `File ${name}` : `Skill ${name}`}
      data-mention={type}
    >
      <Icon className="size-3.5" />
      {name}
    </span>
  );
}
