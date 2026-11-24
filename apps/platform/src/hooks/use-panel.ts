import { useLocalStorage } from "@aven/ui/use-local-storage";
import { useCallback } from "react";

export function usePanel(key: string, initial: boolean) {
  const [open, setOpen] = useLocalStorage(key, initial);
  const toggle = useCallback(() => setOpen((current) => !current), [setOpen]);
  const show = useCallback(() => setOpen(true), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  return { open, toggle, show, close };
}
