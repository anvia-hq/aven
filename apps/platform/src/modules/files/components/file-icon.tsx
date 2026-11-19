import { IconFile } from "@tabler/icons-react";
import { cn } from "cn";

import { useFileIcon } from "../hooks/use-file-icon";

export function FileIcon({ path, className }: { path: string; className?: string }) {
  const url = useFileIcon(path);

  if (!url) return <IconFile className={cn("shrink-0 text-muted-foreground", className)} />;

  return <img src={url} alt="" aria-hidden className={cn("shrink-0", className)} />;
}
