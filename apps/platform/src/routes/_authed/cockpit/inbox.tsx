import { Inbox } from "@mynaui/icons-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { withTag } from "@/modules/cockpit/components/cockpit-page";
import { InboxPane, type InboxShown } from "@/modules/cockpit/components/inbox-pane";
import { InboxDraft } from "@/modules/cockpit/components/inbox-draft";
import { InboxReader } from "@/modules/cockpit/components/inbox-reader";
import { NothingOpen, SplitView } from "@/modules/cockpit/components/split-view";
import { useInbox } from "@/modules/cockpit/hooks/use-inbox";

const NEW_ITEM = "new";

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
  // `?item=new` is an item being written, not kept until it is added.
  const creating = openId === NEW_ITEM;
  const open = items.find((item) => item.id === openId);
  const go = (search: Partial<InboxSearch>, replace = false) =>
    void navigate({ search: (prev) => ({ ...prev, ...search }), replace });

  function detail() {
    if (creating) {
      return (
        <InboxDraft
          tag={tag}
          // The draft is gone once added: going back leads to the inbox, not to it again.
          onAdded={(id) => go({ item: id, show: undefined }, true)}
          onCancel={() => go({ item: undefined })}
        />
      );
    }
    if (open) {
      return <InboxReader key={open.id} item={open} onClose={() => go({ item: undefined })} />;
    }
    return (
      <NothingOpen icon={Inbox}>
        Pick something from your inbox, or add a new one with +.
      </NothingOpen>
    );
  }

  return (
    <SplitView
      open={creating || Boolean(open)}
      list={
        loaded && (
          <InboxPane
            items={withTag(items, tag)}
            shown={shown}
            tag={tag}
            selected={openId}
            creating={creating}
            onShow={(next) => go({ show: next === "done" ? "done" : undefined })}
            onSelect={(id) => go({ item: id })}
            onNew={() => go({ item: NEW_ITEM })}
          />
        )
      }
      detail={detail()}
    />
  );
}
