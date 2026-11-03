import { Paperclip } from "@mynaui/icons-react";
import { useRef } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";

// The composer's button for picking files to send with a message.
export function AttachButton({
  onPick,
  title,
  disabled = false,
}: {
  onPick: (files: FileList) => void;
  title: string;
  /** Files cannot be sent just now; `title` says why. */
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
          // Picking the same file again must still count as a change.
          event.target.value = "";
        }}
      />
      <Button
        variant="ghost"
        size="icon-sm"
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
