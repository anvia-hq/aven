import { cn } from "cn";
import type { CSSProperties } from "react";

import { Button } from "@aven/ui/button";
import { FileIcon } from "./file-icon";

type Props = {
  path: string;
  label: string;
  active: boolean;
  title?: string;
  style?: CSSProperties;
  onOpen: (path: string) => void;
};

export function FileButton({ path, label, active, title, style, onOpen }: Props) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("w-full justify-start font-normal", active && "bg-muted")}
      style={style}
      title={title}
      onClick={() => onOpen(path)}
    >
      <FileIcon path={path} className="size-4" />
      <span className="truncate">{label}</span>
    </Button>
  );
}
