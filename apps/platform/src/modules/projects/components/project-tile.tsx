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
// a sidebar. The initial takes the page's background color, so it is dark on a dark theme and white
// on a light one, with a lighter shadow there. It says nothing to a screen reader: the name beside it does.
export function ProjectTile({ projectId, palette, name, className }: Props) {
  return (
    <span
      aria-hidden
      style={tileStyle(projectId, palette)}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] text-[9px] leading-none font-bold text-background shadow-[inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-1px_1px_rgb(0_0_0/0.1),0_1px_1px_rgb(0_0_0/0.08)] select-none dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-1px_1px_rgb(0_0_0/0.18),0_1px_2px_rgb(0_0_0/0.25)]",
        className,
      )}
    >
      {projectInitial(name)}
    </span>
  );
}
