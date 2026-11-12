import { Trash } from "@mynaui/icons-react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { timeAgo } from "@/lib/format";

import { useAccessTokens } from "../hooks/use-access-tokens";
import type { AccessToken } from "../types";
import { PERMISSIONS } from "./access-token-dialog";
import { ConnectSnippets } from "./connect-snippets";

const labelOf = (id: string) => PERMISSIONS.find((item) => item.id === id)?.label ?? id;

function AccessTokenRow({ token }: { token: AccessToken }) {
  const { remove } = useAccessTokens();

  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{token.name}</span>
          {token.permissions.map((permission) => (
            <Badge
              key={permission}
              variant={permission === "destructive" ? "destructive" : "secondary"}
            >
              {labelOf(permission)}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono">avn_…{token.hint}</span>
          {" · "}
          {token.lastUsedAt ? `Used ${timeAgo(token.lastUsedAt, true)}` : "Never used"}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${token.name}`}
        onClick={() => void remove(token)}
      >
        <Trash />
      </Button>
    </li>
  );
}

export function AccessTokensList() {
  const { tokens, loaded } = useAccessTokens();

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-8">
      {tokens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No access tokens yet. Make one for each tool that should reach Aven.
        </p>
      ) : (
        <ul aria-label="Access tokens" className="flex flex-col">
          {tokens.map((token) => (
            <AccessTokenRow key={token.id} token={token} />
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Connect a tool</h2>
        <p className="text-sm text-muted-foreground">
          Point an MCP client at the endpoint and send a token as a Bearer header. The server also
          offers a guide, <span className="font-mono">aven://guide</span>, that tells an agent how
          to use Aven.
        </p>
        <ConnectSnippets token="avn_your_token" />
      </section>
    </div>
  );
}
