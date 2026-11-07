import type { ComponentProps } from "react";

import { MENTION_MARK } from "../mentions";
import { MentionChip } from "./mention-chip";

export function mentionCode({
  node: _node,
  children,
  ...props
}: ComponentProps<"code"> & { node?: unknown }) {
  if (typeof children === "string" && children.startsWith(MENTION_MARK)) {
    const [type, ...name] = children.slice(MENTION_MARK.length).split(":");
    return <MentionChip type={type === "file" ? "file" : "skill"} name={name.join(":")} />;
  }
  return <code {...props}>{children}</code>;
}
