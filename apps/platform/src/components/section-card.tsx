import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  label?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SectionCard({ title, label, actions, children }: Props) {
  return (
    <section
      aria-label={label ?? (typeof title === "string" ? title : undefined)}
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex h-11 items-center justify-between gap-2 border-b px-4 text-sm font-medium">
        <div className="flex min-w-0 items-center gap-2">{title}</div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
