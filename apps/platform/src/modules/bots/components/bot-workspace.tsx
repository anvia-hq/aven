import { useDefaultLayout } from "react-resizable-panels";

import { PANEL_EXIT_MS, PanelEnter } from "@/components/panel-enter";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@aven/ui/resizable";
import { useHeldValue } from "@/hooks/use-held";
import { safeStorage } from "@/hooks/use-local-storage";
import { useMediaQuery } from "@/hooks/use-media-query";
import { GAP_HANDLE } from "@/lib/panel-layout";
import { useDefaultTimezone } from "@/modules/settings/hooks/use-timezone";

import { artifactGroups, findArtifact } from "../artifacts";
import { useBotChat } from "../hooks/use-bot-chat";
import { useOpenArtifact } from "../hooks/use-open-artifact";
import type { Bot } from "../types";
import { ArtifactPanel } from "./artifact-panel";
import { BotChat } from "./bot-chat";
import { BotHeader } from "./bot-header";

export function BotWorkspace({ bot }: { bot: Bot }) {
  const wide = useMediaQuery("(min-width: 1024px)");
  useDefaultTimezone();
  const chat = useBotChat(bot.id);
  const { artifact, show } = useOpenArtifact();
  const live = findArtifact(artifactGroups(chat.messages), artifact);
  const { shown: found, leaving } = useHeldValue(live, PANEL_EXIT_MS);
  const panelIds = found ? ["conversation", "artifact"] : ["conversation"];
  const layout = useDefaultLayout({
    id: "aven.bot.artifact.panels",
    panelIds,
    storage: safeStorage,
  });
  const panel = found && (
    <PanelEnter leaving={leaving}>
      <ArtifactPanel
        botId={bot.id}
        group={found.group}
        version={found.version}
        number={found.number}
        onVersion={show}
        onClose={() => show(undefined)}
      />
    </PanelEnter>
  );
  const conversation = (
    <div className="relative @container flex h-full min-h-0 min-w-0 flex-col overflow-clip bg-background md:rounded-xl md:border md:border-sidebar-border">
      <BotHeader bot={bot} />
      <BotChat bot={bot} chat={chat} openArtifact={artifact} onOpenArtifact={show} />
    </div>
  );

  return (
    <div className="flex h-[calc(100svh-var(--mobile-chrome))] min-w-0 flex-col md:h-[calc(100svh-1rem)]">
      {found && wide ? (
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="conversation" defaultSize="55" minSize="30">
            {conversation}
          </ResizablePanel>
          <ResizableHandle className={GAP_HANDLE} />
          <ResizablePanel id="artifact" defaultSize="45" minSize="25">
            {panel}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        (panel ?? conversation)
      )}
    </div>
  );
}
