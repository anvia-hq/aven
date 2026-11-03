import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";
import { CockpitPage, withTag } from "@/modules/cockpit/components/cockpit-page";
import { InboxCapture } from "@/modules/cockpit/components/inbox-capture";
import { InboxList } from "@/modules/cockpit/components/inbox-list";
import { useInbox } from "@/modules/cockpit/hooks/use-inbox";

export const Route = createFileRoute("/_authed/cockpit/inbox")({
  validateSearch: (search: Record<string, unknown>): { tag?: string } => ({
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const { tag } = Route.useSearch();
  const { items, loaded } = useInbox();
  const [shown, setShown] = useState<"open" | "done">("open");
  const tagged = withTag(items, tag);
  const listed = tagged.filter((item) => item.done === (shown === "done"));

  return (
    <CockpitPage
      title="Inbox"
      tag={tag}
      to="/cockpit/inbox"
      actions={
        <ToggleGroup
          value={[shown]}
          onValueChange={(value: string[]) => value[0] && setShown(value[0] as "open" | "done")}
          variant="outline"
          size="sm"
          spacing={0}
        >
          <ToggleGroupItem value="open">Open</ToggleGroupItem>
          <ToggleGroupItem value="done">Done</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <InboxCapture key={tag ?? ""} tag={tag} />
      {loaded && (
        <InboxList
          items={listed}
          label={shown === "open" ? "Open items" : "Done items"}
          empty={
            shown === "open"
              ? "Nothing in your inbox. Capture whatever comes to mind."
              : "Nothing done yet."
          }
        />
      )}
    </CockpitPage>
  );
}
