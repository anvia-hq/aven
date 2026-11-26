import { IconCodeblock, IconFolder } from "@tabler/icons-react";
import { cn } from "cn";
import type { Mentionable } from "../types";
import { bubbleInk } from "@/lib/bubble-tint";
import { FileIcon } from "@/modules/files/components/file-icon";

function mentionTitle(type: Mentionable["type"], name: string) {
  if (type !== "file") return `Skill ${name}`;

  return name.endsWith("/") ? `Folder ${name}` : `File ${name}`;
}

export function MentionChip({ type, name, color }: Mentionable & { color?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-fit items-center gap-1 align-middle font-mono leading-none text-[0.85em] font-medium",
        color ? bubbleInk(color) : "text-code",
      )}
      title={mentionTitle(type, name)}
      data-mention={type}
    >
      {type === "file" &&
        (name.endsWith("/") ? (
          <IconFolder className="size-3.5" />
        ) : (
          <FileIcon path={name} className="my-0! size-3.5" />
        ))}
      {name}
    </span>
  );
}

export function CommandChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle font-mono leading-none text-[0.85em] font-medium text-code"
      title={`Command /${name}`}
      data-mention="command"
    >
      <IconCodeblock className="size-3.5" />/{name}
    </span>
  );
}
