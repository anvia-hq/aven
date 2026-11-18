import { PaperclipIcon } from "@solar-icons/react/linear";
import { useRef } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";

export function AttachButton({
  onPick,
  title,
  disabled = false,
}: {
  onPick: (files: FileList) => void;
  title: string;
  disabled?: boolean;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <Input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) onPick(event.target.files);

          event.target.value = "";
        }}
      />
      <Button
        variant="outline"
        size="icon-sm"
        className="size-9 rounded-full bg-muted/40 text-muted-foreground md:size-7"
        aria-label="Attach files"
        title={title}
        disabled={disabled}
        onClick={() => picker.current?.click()}
      >
        <PaperclipIcon />
      </Button>
    </>
  );
}
