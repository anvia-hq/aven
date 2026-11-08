import { BookOpen, File, Terminal } from "@mynaui/icons-react";
import type { Mentionable } from "../types";

export function MentionChip({ type, name, sent = false }: Mentionable & { sent?: boolean }) {
  const Icon = type === "file" ? File : BookOpen;
  const showIcon = type === "file" || !sent;
  return (
    <span
      className="inline-flex h-fit items-center gap-1 align-middle rounded bg-code/10 px-1 py-0.5 font-mono leading-none text-[0.85em] font-medium text-code"
      title={type === "file" ? `File ${name}` : `Skill ${name}`}
      data-mention={type}
    >
      {showIcon && <Icon className="size-3.5" />}
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
      <Terminal className="size-3.5" />/{name}
    </span>
  );
}
