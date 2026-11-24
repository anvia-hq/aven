import {
  IconAlertCircle,
  IconAlertTriangle,
  IconBrowser,
  IconCheck,
  IconChecklist,
  IconCode,
  IconDeviceDesktop,
  IconFileText,
  IconGitBranch,
  IconGitPullRequest,
  IconLoader2,
  IconRocket,
  IconSearch,
  IconSparkles,
  IconTerminal2,
  IconWorld,
} from "@tabler/icons-react";
import { cn } from "cn";

import type { TimelineIcon } from "../types";

export function TimelineIconGlyph({
  icon,
  running = false,
  className,
}: {
  icon: TimelineIcon;
  running?: boolean;
  className?: string;
}) {
  const classes = cn("size-4 shrink-0 text-muted-foreground", className);

  if (running) return <IconLoader2 aria-hidden className={cn(classes, "animate-spin")} />;

  switch (icon) {
    case "search":
      return <IconSearch aria-hidden className={classes} />;
    case "file":
      return <IconFileText aria-hidden className={classes} />;
    case "code":
      return <IconCode aria-hidden className={classes} />;
    case "test":
      return <IconRocket aria-hidden className={classes} />;
    case "check":
      return <IconCheck aria-hidden className={classes} />;
    case "warning":
      return <IconAlertTriangle aria-hidden className={classes} />;
    case "error":
      return <IconAlertCircle aria-hidden className={classes} />;
    case "browser":
      return <IconBrowser aria-hidden className={classes} />;
    case "pr":
      return <IconGitPullRequest aria-hidden className={classes} />;
    case "git":
      return <IconGitBranch aria-hidden className={classes} />;
    case "task":
      return <IconChecklist aria-hidden className={classes} />;
    case "computer":
      return <IconDeviceDesktop aria-hidden className={classes} />;
    case "globe":
      return <IconWorld aria-hidden className={classes} />;
    case "sparkles":
      return <IconSparkles aria-hidden className={classes} />;
    case "terminal":
      return <IconTerminal2 aria-hidden className={classes} />;
  }
}
