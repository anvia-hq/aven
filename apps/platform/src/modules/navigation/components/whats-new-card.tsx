export function WhatsNewCard() {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card/60 p-3 group-data-[collapsible=icon]:hidden">
      <p className="text-[10px] font-medium tracking-wider text-primary uppercase">
        What's new · Today
      </p>
      <p className="text-sm font-medium">Snooze and archive threads</p>
      <p className="text-xs text-muted-foreground">
        Keep the sidebar tidy. Snoozed and archived threads move to their own groups.
      </p>
    </div>
  );
}
