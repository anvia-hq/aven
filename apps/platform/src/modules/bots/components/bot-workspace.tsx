import { useDefaultLayout } from "react-resizable-panels";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/resizable";
import { safeStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GAP_HANDLE } from "@/lib/panel-layout";

import { useBotPanels } from "../hooks/use-bot-panels";
import type { Bot } from "../types";
import { BotChat } from "./bot-chat";
import { BotHeader } from "./bot-header";
import { BotSidePanels } from "./bot-side-panels";

// The bot's chat, with its computer's desktop beside it when it is open, laid out as a thread's
// conversation and side panel are.
export function BotWorkspace({ bot }: { bot: Bot }) {
  // Side by side needs room; on a narrow screen the desktop stacks under the chat.
  const wide = useMediaQuery("(min-width: 1024px)");
  const panels = useBotPanels();
  const sideOpen = panels.desktop.open;
  // Each orientation and each set of panels keeps its own sizes.
  const layout = useDefaultLayout({
    id: `aven.bot-panels.${wide ? "row" : "column"}`,
    panelIds: sideOpen ? ["conversation", "side"] : ["conversation"],
    storage: safeStorage,
  });

  return (
    <div className="flex h-[calc(100svh-2.5rem)] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      <div className="min-h-0 flex-1">
        {/* The chat stays the first panel whether or not the computer is open, so opening it does
            not remount the chat and reconnect it. */}
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
