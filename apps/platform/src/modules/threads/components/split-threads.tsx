import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
} from "@aven/ui/resizable";
import { safeStorage } from "@aven/ui/use-local-storage";

import { useSplitPairs } from "../hooks/use-split-pairs";
import { ThreadPane } from "./thread-pane";

const PANE = "h-full min-w-0 data-[active=false]:[--background:var(--pane-dim)]";

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
  const [active, setActive] = useState<"main" | "split">("main");
  const only = (id: string) => {
    unpair(id);
    return navigate({ to: "/threads/$threadId", params: { threadId: id } });
  };
  return (
    <div className="h-[calc(100svh-var(--mobile-chrome))] min-w-0 [--pane-dim:color-mix(in_oklab,var(--background),black_4%)] dark:[--pane-dim:color-mix(in_oklab,var(--background),black_35%)] md:h-svh">
      <ResizablePanelGroup
        orientation="horizontal"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel id="main" defaultSize="50" minSize="30">
          <div
            className={PANE}
            data-active={active === "main"}
            onPointerDownCapture={() => setActive("main")}
            onFocusCapture={() => setActive("main")}
          >
            <ThreadPane key={threadId} threadId={threadId} split onClose={() => void only(split)} />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="split" defaultSize="50" minSize="30">
          <div
            className={PANE}
            data-active={active === "split"}
            onPointerDownCapture={() => setActive("split")}
            onFocusCapture={() => setActive("split")}
          >
            <ThreadPane key={split} threadId={split} split onClose={() => void only(threadId)} />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
