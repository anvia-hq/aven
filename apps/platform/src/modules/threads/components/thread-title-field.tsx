import { useRef } from "react";

import { THREAD_TITLE_MAX } from "@aven/protocol/threads";
import { Input } from "@aven/ui/input";

export function ThreadTitleField({
  title,
  onDone,
}: {
  title: string;
  onDone: (title?: string) => void;
}) {
  const finished = useRef(false);
  const finish = (value?: string) => {
    if (finished.current) return;

    finished.current = true;
    onDone(value);
  };
  return (
    <Input
      autoFocus
      aria-label="Thread title"
      defaultValue={title}
      maxLength={THREAD_TITLE_MAX}
      className="h-6 flex-1 px-1.5 text-sm"
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Enter") finish(event.currentTarget.value);

        if (event.key === "Escape") finish();
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
