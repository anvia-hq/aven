import { Bug, Database, Github, Globe, Link as LinkIcon, Slack } from "@mynaui/icons-react";

import { Switch } from "@/components/switch";

import { useIntegrations } from "../hooks/use-integrations";
import type { IntegrationIcon } from "../types";

const icons: Record<IntegrationIcon, typeof Github> = {
  github: Github,
  slack: Slack,
  linear: LinkIcon,
  sentry: Bug,
  postgres: Database,
  browser: Globe,
};

export function IntegrationList() {
  const { integrations, setConnected } = useIntegrations();

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {integrations.map((item) => {
        const Icon = icons[item.icon];
        return (
          <li key={item.id} className="flex items-center gap-4 px-4 py-3">
            <Icon className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">{item.name}</span>
              <span className="truncate text-xs text-muted-foreground">{item.description}</span>
            </div>
            <Switch
              aria-label={item.name}
              checked={item.connected}
              onCheckedChange={(checked) => setConnected(item.id, item.name, checked)}
            />
          </li>
        );
      })}
    </ul>
  );
}
