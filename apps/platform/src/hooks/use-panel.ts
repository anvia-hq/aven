import { useLocalStorage } from "@/hooks/use-local-storage";

export function usePanel(key: string, initial: boolean) {
  const [open, setOpen] = useLocalStorage(key, initial);
  return {
    open,
    toggle: () => setOpen(!open),
    show: () => setOpen(true),
    close: () => setOpen(false),
  };
}
