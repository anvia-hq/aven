export function CompactionDivider({ label }: { label: string }) {
  return (
    <div
      role="separator"
      aria-label={label}
      className="my-8 flex items-center gap-3 text-sm text-muted-foreground"
      data-role="compaction"
    >
      <span className="h-px flex-1 bg-border" />
      <span className="shrink-0 font-medium">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
