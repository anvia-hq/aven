import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GAP_HANDLE } from "@/lib/panel-layout";
import { useDefaultTimezone } from "@/modules/settings/hooks/use-timezone";

import { useBotPanels } from "../hooks/use-bot-panels";
import type { Bot } from "../types";
import { BotChat } from "./bot-chat";
import { BotHeader } from "./bot-header";
import { BotSidePanels } from "./bot-side-panels";

export function BotWorkspace({ bot }: { bot: Bot }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  useDefaultTimezone();
  const panels = useBotPanels();
  const sideOpen = panels.desktop.open;
  const layout = useDefaultLayout({
    id: `aven.bot-panels.${wide ? "row" : "column"}`,
    panelIds: sideOpen ? ["conversation", "side"] : ["conversation"],
    storage: safeStorage,
  });

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          orientation={wide ? "horizontal" : "vertical"}
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" defaultSize="50" minSize="30">
            <div className="@container flex h-full min-w-0 flex-col overflow-clip bg-background md:rounded-r-xl md:border-y md:border-r md:border-sidebar-border">
              <BotHeader bot={bot} panels={panels} />
              <BotChat bot={bot} />
            </div>
          </ResizablePanel>
          {sideOpen && (
            <>
              <ResizableHandle className={GAP_HANDLE} />
              <ResizablePanel id="side" defaultSize="50" minSize="25">
                <BotSidePanels botId={bot.id} panels={panels} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
