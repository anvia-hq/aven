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
      className="h-8 flex-1 px-2 text-base md:h-6 md:px-1.5 md:text-sm"
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
