import { cn } from "cn";
import { useState, type ReactNode } from "react";

type Props = { when: boolean; className?: string; children: ReactNode };

export function RiseIn({ when, className, children }: Props) {
  const [rises] = useState(when);
  return <div className={cn(className, rises && "rise-in")}>{children}</div>;
}
