import { isDriving } from "@aven/protocol/drivers";

import type { Crowd, Thread } from "./types";

export const CROWD_SHOWN = 3;

export function crowdOf(thread: Thread): Crowd | null {
  const creator = {
    id: thread.createdBy,
    name: thread.createdByName,
    image: thread.createdByImage,
  };
  const others = thread.participants.filter((person) => person.id !== creator.id);

  if (others.length === 0 && !isDriving(thread.drivingUntil)) return null;

  const people = [creator, ...others];
  return {
    shown: people.slice(0, CROWD_SHOWN),
    more: Math.max(0, people.length - CROWD_SHOWN),
    names: people.map((person) => person.name),
  };
}
