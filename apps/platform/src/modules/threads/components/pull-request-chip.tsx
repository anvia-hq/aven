import { ExternalLink } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { FLOATING_BUTTON } from "@/lib/floating-button";
import { ButtonGroup } from "@/components/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";

import type { ThreadPullRequest } from "../types";

type Props = { pullRequests: ThreadPullRequest[] };

export function PullRequestChip({ pullRequests }: Props) {
  const [newest] = pullRequests;
  if (!newest) return null;
  const more = pullRequests.length - 1;
  return (
    <ButtonGroup>
      <Button
        variant="secondary"
        size="sm"
        className={FLOATING_BUTTON}
        nativeButton={false}
        role="link"
        render={<a href={newest.url} target="_blank" rel="noreferrer" />}
      >
        #{newest.number}
        <ExternalLink />
      </Button>
      {more > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className={FLOATING_BUTTON}
                title="Every pull request of this thread"
              />
            }
          >
            +{more}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Pull requests</DropdownMenuLabel>
              {pullRequests.map((pull) => (
                <DropdownMenuItem
                  key={pull.number}
                  render={<a href={pull.url} target="_blank" rel="noreferrer" />}
                >
                  <span className="shrink-0 text-muted-foreground">#{pull.number}</span>
                  <span className="min-w-0 flex-1 truncate">{pull.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{pull.state}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </ButtonGroup>
  );
}
