import { createFileRoute } from "@tanstack/react-router";

import { useMediaQuery } from "@/hooks/use-media-query";
import { SplitDropZone } from "@/modules/threads/components/split-drop-zone";
import { SplitThreads } from "@/modules/threads/components/split-threads";
import { ThreadPane } from "@/modules/threads/components/thread-pane";

export const Route = createFileRoute("/_authed/_shell/threads/$threadId")({
  validateSearch: (search: Record<string, unknown>): { split?: string } => ({
    split: typeof search.split === "string" && search.split !== "" ? search.split : undefined,
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { threadId } = Route.useParams();
  const { split } = Route.useSearch();
  const wide = useMediaQuery("(min-width: 1024px)");
  return (
    <SplitDropZone threadId={threadId} split={split} enabled={wide}>
      {split && wide && split !== threadId ? (
        <SplitThreads threadId={threadId} split={split} />
      ) : (
        <ThreadPane key={threadId} threadId={threadId} />
      )}
    </SplitDropZone>
  );
}
