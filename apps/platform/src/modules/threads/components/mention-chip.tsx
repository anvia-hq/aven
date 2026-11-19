import { IconCodeblock, IconFile } from "@tabler/icons-react";
import type { CSSProperties } from "react";
import type { Mentionable } from "../types";

export function MentionChip({ type, name, tint }: Mentionable & { tint?: CSSProperties }) {
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      style={tint}
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
