import { Trash } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { timeAgo } from "@/lib/format";

import { useApiKeys } from "../hooks/use-api-keys";

export function ApiKeysTable() {
  const { keys, revoke } = useApiKeys();

  if (keys.length === 0) return <p className="text-sm text-muted-foreground">No API keys yet.</p>;

  return (
    <Table aria-label="API keys">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id}>
            <TableCell className="font-medium">{key.name}</TableCell>
            <TableCell className="font-mono text-xs">{key.prefix}</TableCell>
            <TableCell>{timeAgo(key.createdAt, true)}</TableCell>
            <TableCell>{key.lastUsedAt ? timeAgo(key.lastUsedAt, true) : "Never"}</TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke ${key.name}`}
                onClick={() => revoke(key.id, key.name)}
              >
                <Trash />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
