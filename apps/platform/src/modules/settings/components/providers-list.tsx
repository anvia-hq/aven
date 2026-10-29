import { Trash } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";

import { useProviders } from "../hooks/use-providers";
import { PROVIDER_LABELS } from "../types";

export function ProvidersList() {
  const { providers, loaded, makeDefault, remove } = useProviders();

  if (!loaded) return null;
  if (providers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No providers yet. Add one to run threads with your own model.
      </p>
    );
  }

  return (
    <Table aria-label="Providers">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Key</TableHead>
          <TableHead className="w-40" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {providers.map((provider) => (
          <TableRow key={provider.id}>
            <TableCell className="font-medium">
              <span className="flex items-center gap-2">
                {provider.name}
                {provider.isDefault && <Badge variant="secondary">Default</Badge>}
              </span>
            </TableCell>
            <TableCell>{PROVIDER_LABELS[provider.kind]}</TableCell>
            <TableCell className="font-mono text-xs">{provider.modelId ?? "Default"}</TableCell>
            <TableCell className="font-mono text-xs">
              {provider.keyHint ? `…${provider.keyHint}` : "None"}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                {!provider.isDefault && (
                  <Button variant="outline" size="sm" onClick={() => makeDefault(provider)}>
                    Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${provider.name}`}
                  onClick={() => remove(provider)}
                >
                  <Trash />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
