import { Trash } from "@mynaui/icons-react";
import { cn } from "cn";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { SettingsEmpty, SettingsList, SettingsRow } from "@/components/settings-section";
import { timeAgo } from "@/lib/format";

import { RotateRuntimeDialog } from "./rotate-runtime-dialog";
import { UpdateRuntimeDialog } from "./update-runtime-dialog";

import { useRuntimes } from "../hooks/use-runtimes";

export function RuntimesList() {
  const { runtimes, loaded, revoke, isOwnedByMe } = useRuntimes({ poll: true });

  if (!loaded) return null;
  if (runtimes.length === 0) return <SettingsEmpty>No runtimes yet.</SettingsEmpty>;

  return (
    <SettingsList label="Runtimes">
      {runtimes.map((runtime) => (
        <div key={runtime.id} role="listitem" className="contents">
          <SettingsRow
            leading={
              <span
                role="img"
                aria-label={runtime.online ? "Online" : "Offline"}
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  runtime.online ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
            }
            title={runtime.name}
            description={
              <span className="flex flex-wrap items-center gap-x-2">
                <span>{runtime.online ? "Online" : "Offline"}</span>
                {runtime.build && <span className="font-mono">v{runtime.build}</span>}
                {runtime.outdated && (
                  <Badge
                    variant="outline"
                    title="Update it here, or run `aven update` on that machine"
                  >
                    Update available
                  </Badge>
                )}
                <span className="font-mono">
                  {runtime.ownerId === null ? "Built in" : `token …${runtime.tokenHint}`}
                </span>
                <span>
                  {runtime.lastSeenAt ? `Seen ${timeAgo(runtime.lastSeenAt, true)}` : "Never seen"}
                </span>
              </span>
            }
          >
            <UpdateRuntimeDialog runtime={runtime} />
            {isOwnedByMe(runtime) && (
              <>
                <RotateRuntimeDialog runtime={runtime} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Revoke ${runtime.name}`}
                  onClick={() => void revoke(runtime)}
                >
                  <Trash />
                </Button>
              </>
            )}
          </SettingsRow>
        </div>
      ))}
    </SettingsList>
  );
}
