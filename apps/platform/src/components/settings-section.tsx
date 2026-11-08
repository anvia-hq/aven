import type { ReactNode } from "react";

type PageProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function SettingsPage({ title, description, actions, children }: PageProps) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 py-8 md:py-14">
      <header className="flex items-start justify-between gap-4 pb-6">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

type SectionProps = {
  title: string;
  description?: string;
  leading?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({ title, description, leading, children }: SectionProps) {
  return (
    <section
      aria-label={title}
      className="grid gap-4 border-t py-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10"
    >
      <div className="flex flex-col gap-1">
        {leading && <div className="mb-2">{leading}</div>}
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="text-xs text-balance text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type RowProps = {
  title: ReactNode;
  description?: ReactNode;
  leading?: ReactNode;
  children?: ReactNode;
};

export function SettingsRow({ title, description, leading, children }: RowProps) {
  return (
    <div className="flex items-center gap-3 border-b py-4 last:border-b-0">
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2 text-sm font-medium">{title}</div>
        {description && (
          <div className="text-xs text-pretty text-muted-foreground">{description}</div>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1">{children}</div>}
    </div>
  );
}

export function SettingsList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="list" aria-label={label} className="flex flex-col border-t">
      {children}
    </div>
  );
}

export function SettingsEmpty({ children }: { children: ReactNode }) {
  return <p className="border-t py-10 text-sm text-muted-foreground">{children}</p>;
}
