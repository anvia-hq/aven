import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
};

export function AuthShell({ title, description, footer, children }: Props) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col">
        <div className="mb-8 flex flex-col gap-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        <img
          src="/logo-wordmark.png"
          alt="Anvia"
          className="mx-auto mt-14 h-5 w-auto invert dark:invert-0"
        />
      </div>
    </main>
  );
}
