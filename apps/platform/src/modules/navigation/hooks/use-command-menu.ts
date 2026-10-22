import { useAtom } from "jotai";

import { commandOpenAtom } from "../atoms/command-atom";

export function useCommandMenu() {
  const [open, setOpen] = useAtom(commandOpenAtom);
  return { open, setOpen };
}
