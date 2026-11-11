import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { GAP_HANDLE } from "@/lib/panel-layout";

import { useSplitPairs } from "../hooks/use-split-pairs";
import { ThreadPane } from "./thread-pane";

type Props = { threadId: string; split: string };

export function SplitThreads({ threadId, split }: Props) {
  const navigate = useNavigate();
  const { pair, unpair } = useSplitPairs();
  useEffect(() => {
    pair(threadId, split);
  }, [pair, threadId, split]);
  const layout = useDefaultLayout({
    id: "aven.thread-panels.split",
    panelIds: ["main", "split"],
    storage: safeStorage,
  });
  const only = (id: string) => {
    unpair(id);
    return navigate({ to: "/threads/$threadId", params: { threadId: id } });
  };
  return (
    <div className="h-[calc(100svh-var(--mobile-chrome))] min-w-0 md:h-[calc(100svh-1rem)]">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="main" defaultSize="50" minSize="30">
          <ThreadPane key={threadId} threadId={threadId} split onClose={() => void only(split)} />
        </ResizablePanel>
        <ResizableHandle className={GAP_HANDLE} />
        <ResizablePanel id="split" defaultSize="50" minSize="30">
          <ThreadPane key={split} threadId={split} split onClose={() => void only(threadId)} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
