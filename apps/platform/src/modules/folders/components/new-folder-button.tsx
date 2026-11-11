import { Folder } from "@mynaui/icons-react";

import { Button } from "@/components/button";

export function NewFolderButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="New folder" onClick={onClick}>
      <Folder />
    </Button>
  );
}
