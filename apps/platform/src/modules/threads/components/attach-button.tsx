import { Paperclip } from "@mynaui/icons-react";
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
        variant="ghost"
        size="icon-sm"
        className="size-9 rounded-full md:size-7"
        aria-label="Attach files"
        title={title}
        disabled={disabled}
        onClick={() => picker.current?.click()}
      >
        <Paperclip />
      </Button>
    </>
  );
}
