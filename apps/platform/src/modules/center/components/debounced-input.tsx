import { useEffect, useRef, useState, type ComponentProps } from "react";

import { Input } from "@/components/input";

type Props = Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  value: string | undefined;
  onCommit: (value: string | undefined) => void;
};

export function DebouncedInput({ value, onCommit, ...props }: Props) {
  const [text, setText] = useState(value ?? "");
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => setText(value ?? ""), [value]);
  useEffect(() => {
    if (text.trim() === (value ?? "")) return;

    const timer = setTimeout(() => commit.current(text.trim() || undefined), 400);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

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
