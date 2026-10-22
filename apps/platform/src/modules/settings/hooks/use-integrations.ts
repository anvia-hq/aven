import { useAtom } from "jotai";

import { toast } from "@/components/toast";

import { integrationsAtom } from "../atoms/integrations-atom";

export function useIntegrations() {
  const [integrations, setIntegrations] = useAtom(integrationsAtom);

  function setConnected(id: string, name: string, connected: boolean) {
    setIntegrations((all) => all.map((item) => (item.id === id ? { ...item, connected } : item)));
    toast.add({
      title: connected ? `${name} connected` : `${name} disconnected`,
      type: connected ? "success" : "info",
    });
  }

  return { integrations, setConnected };
}
