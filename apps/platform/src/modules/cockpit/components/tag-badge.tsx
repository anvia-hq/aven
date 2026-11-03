import type { CSSProperties } from "react";

import { cn } from "cn";

import { Badge } from "@/components/badge";
import { paletteColor } from "@/modules/bots/avatar";

/** A tag's color, the bots' palette picked by its name (decision 0106), as `--tag`. */
export const tagColor = (tag: string) => ({ "--tag": paletteColor(tag) }) as CSSProperties;

// A tag tinted its color: the color faint behind, and the text darker in light mode and lighter in
// dark so it reads on either.
export const tagClass =
  "border-transparent bg-(--tag)/15 text-[color-mix(in_oklab,var(--tag)_65%,black)] dark:bg-(--tag)/20 dark:text-[color-mix(in_oklab,var(--tag)_70%,white)]";

export function TagBadge({
  tag,
  className,
  ...props
}: { tag: string } & Omit<React.ComponentProps<typeof Badge>, "variant">) {
  return (
    <Badge
      variant="outline"
      style={tagColor(tag)}
      className={cn(tagClass, "[a]:hover:bg-(--tag)/25 [a]:hover:text-inherit", className)}
      {...props}
    >
      {props.children ?? `#${tag}`}
    </Badge>
  );
}
