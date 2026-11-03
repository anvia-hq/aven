import { createFileRoute } from "@tanstack/react-router";

import { SettingsPage } from "@/components/settings-section";
import { MemoryHistoryDialog } from "@/modules/memory/components/memory-history-dialog";
import { MemoryList } from "@/modules/memory/components/memory-list";
import { AddNoteDialog } from "@/modules/memory/components/memory-note-dialog";
import { useMemoryFolders } from "@/modules/memory/hooks/use-memory-folders";

export const Route = createFileRoute("/_authed/settings/memory")({
  component: Memory,
});

function Memory() {
  const { sections, loaded, folderOf } = useMemoryFolders();
  return (
    <SettingsPage
      title="Memory"
      description="Notes your agents keep about you and your work, and read in later conversations. They are yours alone, in every workspace. Change or delete any of them."
      actions={
        <>
          <MemoryHistoryDialog folderOf={folderOf} />
          <AddNoteDialog folders={sections} />
        </>
      }
    >
      {loaded && <MemoryList sections={sections} />}
    </SettingsPage>
  );
}
