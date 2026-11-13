import { useRef } from "react";

import { Input } from "@aven/ui/input";

import { FOLDER_NAME_MAX } from "../limits";

type Props = {
  initial: string;
  onDone: (name?: string) => void;
};

export function FolderNameField({ initial, onDone }: Props) {
  const finished = useRef(false);
  const finish = (value?: string) => {
    if (finished.current) return;

    finished.current = true;
    onDone(value);
  };
  return (
    <Input
      autoFocus
      aria-label="Folder name"
      defaultValue={initial}
      maxLength={FOLDER_NAME_MAX}
      className="h-6 min-w-0 flex-1 px-1.5 text-sm"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === "Enter") finish(event.currentTarget.value);

        if (event.key === "Escape") finish();
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
