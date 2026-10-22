import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";

import { useActivity } from "../hooks/use-activity";
import type { ActivityKind } from "../types";
import { ActivityItem } from "./activity-item";

type Filter = ActivityKind | "all";

export function ActivityFeed() {
  const [filter, setFilter] = useState<Filter>("all");
  const events = useActivity(filter);

  return (
    <>
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="thread">Threads</TabsTrigger>
          <TabsTrigger value="commit">Commits</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>
      </Tabs>
      <ul aria-label="Activity feed" className="flex flex-col divide-y rounded-lg border">
        {events.map((event) => (
          <li key={event.id}>
            <ActivityItem event={event} />
          </li>
        ))}
        {events.length === 0 && (
          <li className="p-4 text-sm text-muted-foreground">Nothing here yet.</li>
        )}
      </ul>
    </>
  );
}
