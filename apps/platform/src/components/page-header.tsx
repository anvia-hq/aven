import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="text-base font-semibold">{title}</h1>
        {/* A phone shows the title and the buttons: a sentence of explanation only earns its
            three lines on a wide screen (decision 0172). */}
        {description && (
          <p className="hidden truncate text-sm text-muted-foreground md:block">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
