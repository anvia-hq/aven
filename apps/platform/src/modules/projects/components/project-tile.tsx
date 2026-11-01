import { cn } from "cn";

import { projectInitial, tileStyle } from "../tile";

type Props = {
  /** Picks the colors, so a project keeps its own. */
  projectId: string;
  /** Its first letter is drawn. */
  name: string;
  className?: string;
};

// A project as a small rounded square with a gradient and its initial, the way a tool is drawn in
// a sidebar. It says nothing to a screen reader: the name beside it does.
export function ProjectTile({ projectId, name, className }: Props) {
  return (
    <span
      aria-hidden
      style={tileStyle(projectId)}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[11px] leading-none font-semibold select-none",
        className,
      )}
    >
      {projectInitial(name)}
    </span>
  );
}
