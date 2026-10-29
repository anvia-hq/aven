import { Trash } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/table";
import { authClient } from "@/lib/auth-client";
import { timeAgo } from "@/lib/format";

import { RotateRuntimeDialog } from "./rotate-runtime-dialog";

import { useRuntimes } from "../hooks/use-runtimes";

export function RuntimesList() {
  const { runtimes, loaded, revoke } = useRuntimes({ poll: true });
  const { data: session } = authClient.useSession();

  if (!loaded) return null;
  if (runtimes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No runtimes yet. Threads run on the control plane's own machine until you add one.
      </p>
    );
  }

  return (
    <Table aria-label="Runtimes">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Token</TableHead>
          <TableHead>Last seen</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {runtimes.map((runtime) => (
          <TableRow key={runtime.id}>
            <TableCell className="font-medium">{runtime.name}</TableCell>
            <TableCell>
              <Badge variant={runtime.online ? "secondary" : "outline"}>
                {runtime.online ? "Online" : "Offline"}
              </Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">…{runtime.tokenHint}</TableCell>
            <TableCell className="text-muted-foreground">
              {runtime.lastSeenAt ? timeAgo(runtime.lastSeenAt, true) : "Never"}
            </TableCell>
            <TableCell>
              {runtime.ownerId === session?.user.id && (
                <div className="flex items-center justify-end gap-1">
                  <RotateRuntimeDialog runtime={runtime} />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoke ${runtime.name}`}
                    onClick={() => void revoke(runtime)}
                  >
                    <Trash />
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
