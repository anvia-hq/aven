import { useLocalStorage } from "@/hooks/use-local-storage";

// Whether a panel beside the conversation is open, remembered under `key`.
export function usePanel(key: string, initial: boolean) {
  const [open, setOpen] = useLocalStorage(key, initial);
  return { open, toggle: () => setOpen(!open), close: () => setOpen(false) };
}
