import { toast } from "@/components/toast";

import { inboxAtom } from "../atoms/cockpit-atoms";
import type { InboxItem } from "../types";
import { createCollection } from "./use-collection";

type InboxInput = { title: string; body?: string; tags?: string[] };

const inbox = createCollection<InboxItem, InboxInput, Partial<InboxInput & { done: boolean }>>({
  path: "/cockpit/inbox",
  atom: inboxAtom,
  label: "the inbox",
});

export const resetInbox = inbox.reset;

// The person's inbox: what they captured, newest first.
export function useInbox() {
  const { items, loaded } = inbox.useItems();
  return {
    items,
    loaded,
    capture: (input: InboxInput) => inbox.create(input, "Could not capture it"),
    update: (item: InboxItem, patch: Partial<InboxInput & { done: boolean }>) =>
      inbox.update(item, patch, "Could not save it"),
    async remove(item: InboxItem) {
      if (await inbox.remove(item, "Could not delete it")) {
        toast.add({ title: "Deleted", description: item.title });
      }
    },
  };
}
