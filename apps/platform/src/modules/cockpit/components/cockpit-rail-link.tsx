import { InboxIcon } from "@solar-icons/react/linear";

import { RailLink } from "@/components/rail-link";

export function CockpitRailLink({ active }: { active: boolean }) {
  return (
    <RailLink to="/cockpit/inbox" label="Inbox" active={active}>
      <InboxIcon className="size-[17px]" strokeWidth={1.7} />
    </RailLink>
  );
}
