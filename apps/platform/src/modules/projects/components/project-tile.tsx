import { cn } from "cn";

import { projectInitial, tileStyle } from "../tile";

type Props = {
  /** Picks the colors, so a project keeps its own. */
  projectId: string;
  /** Its palette among the person's projects (`tilePalettes`), else the one its id hashes to. */
  palette?: number;
  /** Its first letter is drawn. */
  name: string;
  className?: string;
};

// A project as a small rounded square with a gradient and its initial, the way a tool is drawn in
// a sidebar. It says nothing to a screen reader: the name beside it does.
export function ProjectTile({ projectId, palette, name, className }: Props) {
  return (
    <span
      aria-hidden
      style={tileStyle(projectId, palette)}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] leading-none font-semibold select-none",
        className,
      )}
    >
      {projectInitial(name)}
    </span>
  );
}
