import { IconMessageDots } from "@tabler/icons-react";

import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { ThreadMark } from "@/modules/threads/components/thread-mark";
import { useThreads } from "@/modules/threads/hooks/use-threads";

export function ThreadMentionMark({ id, className }: { id: string; className?: string }) {
  const { all } = useThreads();
  const palettes = useProjectPalettes();
  const thread = all.find((candidate) => candidate.id === id);

  if (!thread) return <IconMessageDots className={className} aria-hidden />;

  return (
    <ThreadMark
      projectId={thread.projectId}
      runtimeId={thread.runtimeId}
      palette={palettes.get(thread.projectId)}
      color={thread.markColor}
      decorative
      className={className}
    />
  );
}
