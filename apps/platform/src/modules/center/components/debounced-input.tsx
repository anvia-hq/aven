import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Input } from "@/components/input";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  /** What the address holds. */
  value: string | undefined;
  /** Called with what was typed once typing pauses; empty is none. */
  onCommit: (value: string | undefined) => void;
};

// A field whose words go to the address when typing pauses, and which follows the address when that
// changes some other way (a view picked, a filter taken off).
export function DebouncedInput({ value, onCommit, ...props }: Props) {
  const [text, setText] = useState(value ?? "");
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => setText(value ?? ""), [value]);
  useEffect(() => {
    if (text.trim() === (value ?? "")) return;
    const timer = setTimeout(() => commit.current(text.trim() || undefined), 400);
    return () => clearTimeout(timer);
    // Only typing starts the wait.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Enter, leaving the field and Escape (which may close what holds the field) keep what is typed at
  // once, rather than leaving it to the wait.
  const flush = () => {
    if (text.trim() !== (value ?? "")) commit.current(text.trim() || undefined);
  };

  return (
    <Input
      {...props}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={flush}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") flush();
      }}
    />
  );
}
