import type { ComposerTriggerItem } from "@anvia/react-ui/chat";

import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";

import { BotAvatar } from "./bot-avatar";

export function MentionIcon({ item }: { item: ComposerTriggerItem }) {
  const palettes = useProjectPalettes();
  const data = item.data as { kind?: string; avatar?: string; projectId?: string } | undefined;

  if (data?.kind === "bot") {
    return <BotAvatar bot={{ id: item.id, avatar: data.avatar ?? "" }} className="size-5" />;
  }

  if (data?.kind === "thread" && data.projectId) {
    return <ProjectTile projectId={data.projectId} palette={palettes.get(data.projectId)} />;
  }

  return null;
}
