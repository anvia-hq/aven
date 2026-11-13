import { Folder } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";

export function NewFolderButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="New folder" onClick={onClick}>
      <Folder />
    </Button>
  );
}
