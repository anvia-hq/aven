import { IconCodeblock, IconFile } from "@tabler/icons-react";
import { cn } from "cn";
import type { Mentionable } from "../types";
import { bubbleInk, bubbleStyle } from "@/lib/bubble-tint";

export function MentionChip({ type, name, color }: Mentionable & { color?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-fit items-center gap-1 align-middle rounded px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium",
        color ? bubbleInk(color) : "bg-code/10 text-code",
      )}
      style={bubbleStyle(color)}
      title={type === "file" ? `File ${name}` : `Skill ${name}`}
      data-mention={type}
    >
      {type === "file" && <IconFile className="size-3.5" />}
      {name}
    </span>
  );
}

export function CommandChip({ name }: { name: string }) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      title={`Command /${name}`}
      data-mention="command"
    >
      <IconCodeblock className="size-3.5" />/{name}
    </span>
  );
}
