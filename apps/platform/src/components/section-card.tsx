import type { ReactNode } from "react";

type Props = {
  /** What the card is, in its header; a string also names the region. */
  title: ReactNode;
  /** The name of the region when the title is not a plain string. */
  label?: string;
  /** Buttons at the end of the header. */
  actions?: ReactNode;
  children: ReactNode;
};

// A section as a card with a header bar, the way a repository page frames its parts: one look for
// the files, the README and each of the side column's sections.
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
