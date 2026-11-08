import type { ReactNode } from "react";

export function ProjectListEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      {children}
    </div>
  );
}
