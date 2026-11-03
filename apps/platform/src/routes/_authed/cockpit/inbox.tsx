import { Inbox } from "@mynaui/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { withTag } from "@/modules/cockpit/components/cockpit-page";
import { InboxPane, type InboxShown } from "@/modules/cockpit/components/inbox-pane";
import { InboxReader } from "@/modules/cockpit/components/inbox-reader";
import { NothingOpen, SplitView } from "@/modules/cockpit/components/split-view";
import { useInbox } from "@/modules/cockpit/hooks/use-inbox";

type InboxSearch = { tag?: string; item?: string; show?: "done" };

export const Route = createFileRoute("/_authed/cockpit/inbox")({
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    tag: typeof search.tag === "string" && search.tag !== "" ? search.tag : undefined,
    item: typeof search.item === "string" && search.item !== "" ? search.item : undefined,
    show: search.show === "done" ? "done" : undefined,
  }),
  component: InboxPage,
});

function InboxPage() {
  const { tag, item: openId, show } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { items, loaded } = useInbox();
  const shown: InboxShown = show ?? "open";
  const open = items.find((item) => item.id === openId);
  const go = (search: Partial<InboxSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...search }) });

  return (
    <SplitView
      open={Boolean(open)}
      list={
        loaded && (
          <InboxPane
            items={withTag(items, tag)}
            shown={shown}
            tag={tag}
            selected={openId}
            onShow={(next) => go({ show: next === "done" ? "done" : undefined })}
            onSelect={(id) => go({ item: id })}
          />
        )
      }
      detail={
        open ? (
          <InboxReader key={open.id} item={open} onClose={() => go({ item: undefined })} />
        ) : (
          <NothingOpen icon={Inbox}>
            Pick something from your inbox, or capture something new.
          </NothingOpen>
        )
      }
    />
  );
}
