import { ArrowLeft, Dots } from "@mynaui/icons-react";
import { useRef, type ComponentType, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "cn";

import { Button } from "@aven/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@aven/ui/dropdown-menu";
import { Textarea } from "@aven/ui/textarea";

import type { RichTextEditorProps } from "./rich-text-editor-view";
import { RichTextEditor } from "./rich-text-editor";

export function DocumentPage({
  label,
  trail,
  onBack,
  backLabel,
  actions,
  children,
}: {
  label: string;
  trail: ReactNode;
  onBack: () => void;
  backLabel: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <article aria-label={label} className="cockpit-doc flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-1 bg-(--doc-surface)/90 px-3 backdrop-blur">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={backLabel}
          className="md:hidden"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted-foreground"
        >
          {trail}
        </nav>
        <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
      </header>
      <div className="mx-auto w-full max-w-[46rem] px-(--doc-gutter) pt-8 pb-40 md:pt-16">
        {children}
      </div>
    </article>
  );
}

export function Crumb({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        className="shrink-0 px-1.5 font-normal text-muted-foreground"
        onClick={onClick}
      >
        {children}
      </Button>
      <span aria-hidden="true" className="text-muted-foreground/50">
        /
      </span>
    </>
  );
}

export const CurrentCrumb = ({ children }: { children: ReactNode }) => (
  <span aria-current="page" className="truncate px-1.5 text-foreground">
    {children}
  </span>
);

export function MoreMenu({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More"
            className="text-muted-foreground"
          />
        }
      >
        <Dots />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentTitle({
  value,
  onChange,
  onCommit,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  autoFocus?: boolean;
}) {
  const chosen = useRef(false);
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

    event.preventDefault();
    const page = event.currentTarget.closest("article");
    page?.querySelector<HTMLElement>(".bn-editor")?.focus();
  }
  return (
    <Textarea
      aria-label="Title"
      placeholder="Untitled"
      rows={1}
      value={value}
      maxLength={200}
      autoFocus={autoFocus}
      onFocus={(event) => {
        if (!autoFocus || chosen.current) return;

        chosen.current = true;
        event.currentTarget.select();
      }}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, " "))}
      onKeyDown={onKeyDown}
      onBlur={onCommit}
      className="min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[1.75rem] leading-[1.25] font-bold tracking-tight shadow-none placeholder:text-muted-foreground/40 focus-visible:ring-0 md:text-[1.75rem] dark:bg-transparent"
    />
  );
}

export function Properties({ children }: { children: ReactNode }) {
  return <dl className="mt-5 flex flex-col gap-px text-sm">{children}</dl>;
}

export function Property({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-start gap-2">
      <dt className="flex h-8 w-32 shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className="flex min-h-8 min-w-0 flex-1 items-center">{children}</dd>
    </div>
  );
}

export function DocumentBody(props: RichTextEditorProps) {
  return (
    <div className="mt-4 border-t border-border/60 pt-4">
      <RichTextEditor
        {...props}
        className={cn("mx-[calc(var(--doc-gutter)*-1)] min-h-[50vh]", props.className)}
      />
    </div>
  );
}
