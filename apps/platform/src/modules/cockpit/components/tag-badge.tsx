import type { CSSProperties } from "react";

import { cn } from "cn";

import { Badge } from "@/components/badge";

import { useTagColors } from "../hooks/use-tags";

// Black or white, whichever reads on a color: by its relative luminance (WCAG), black on light
// colors such as yellow, white on dark ones such as blue.
function inkOn(hex: string) {
  const channel = (at: number) => {
    const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Where black and white contrast equally with the color.
  return luminance > 0.179 ? "#000" : "#fff";
}

/** A tag's color as `--tag`, and the ink that reads on it as `--tag-ink`. */
export function tagStyle(color: string) {
  return { "--tag": color, "--tag-ink": inkOn(color) } as CSSProperties;
}

// A tag as a solid chip of its color, as a bot's avatar is, its name in black or white.
export const tagClass = "border-transparent bg-(--tag) text-(--tag-ink)";

export function TagBadge({
  tag,
  className,
  ...props
}: { tag: string } & Omit<React.ComponentProps<typeof Badge>, "variant">) {
  const colorOf = useTagColors();
  return (
    <Badge
      variant="outline"
      style={tagStyle(colorOf(tag))}
      className={cn(tagClass, "[a]:hover:bg-(--tag)/85 [a]:hover:text-(--tag-ink)", className)}
      {...props}
    >
      {props.children ?? tag}
    </Badge>
  );
}
