import { Button } from "@/components/button";

export function DangerZone() {
  return (
    <section aria-label="Danger zone" className="flex max-w-md flex-col gap-3">
      <h2 className="text-lg font-semibold text-destructive">Danger zone</h2>
      <p className="text-sm text-muted-foreground">
        Deleting your account removes all threads and API keys. This can't be undone.
      </p>
      <Button variant="outline" className="w-fit text-destructive" disabled>
        Delete account
      </Button>
    </section>
  );
}
