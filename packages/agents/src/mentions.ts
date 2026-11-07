import { mentionToken } from "@aven/protocol/events";

import { WORKSPACE_DIR } from "./sandbox-tools";
import { asRecord } from "./values";
import type { SkillListing } from "./types";
import type { MessageMention } from "@aven/protocol/types";

const unique = (names: string[]) => [...new Set(names)];

export function mentionNote(
  mentions: readonly MessageMention[],
  skills: readonly SkillListing[],
): string | undefined {
  const of = (type: MessageMention["type"]) =>
    unique(mentions.filter((mention) => mention.type === type).map(({ name }) => name));
  const files = of("file");
  const asked = of("skill");
  const sections: string[] = [];
  if (files.length > 0) {
    sections.push(
      [
        `The user pointed at ${files.length === 1 ? "this file" : "these files"} of the workspace with @:`,
        ...files.map((path) => `- ${WORKSPACE_DIR}/${path}`),
      ].join("\n"),
    );
  }
  if (asked.length > 0) {
    const lines = asked.map((name) => {
      const skill = skills.find((candidate) => candidate.name === name);
      return skill ? `- ${name}: ${skill.path}` : `- ${name}: not available in this run`;
    });
    sections.push(
      [
        `The user asked for ${asked.length === 1 ? "this skill" : "these skills"} with /. Read each SKILL.md with read_file before you start, and follow it:`,
        ...lines,
      ].join("\n"),
    );
  }
  return sections.length > 0 ? sections.join("\n\n") : undefined;
}

export function mentionOf(value: unknown): MessageMention | undefined {
  const { type, name, from, to } = asRecord(value);
  if ((type !== "file" && type !== "skill") || typeof name !== "string") return undefined;
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  if (to - from !== mentionToken({ type, name }).length) return undefined;
  return { type, name, from, to };
}
