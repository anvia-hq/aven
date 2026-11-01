import { ExternalLink, Github, Rocket } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { ButtonGroup } from "@/components/button-group";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { useShipThread } from "../hooks/use-ship-thread";
import type { Thread, ThreadPullRequest } from "../types";
import { ShipMenu } from "./ship-menu";

type Props = {
  thread: Thread;
  /** Whether the pull request already has everything the thread changed; there is nothing to update. */
  upToDate: boolean;
};

// Ships the thread as a pull request, as the person; once there is one, it links to it and ships
// again as an update while it is open, and as a new pull request once it is merged or closed. A
// menu offers a separate pull request even while one is open (decision 0069).
export function ShipButton({ thread, upToDate }: Props) {
  const { shipping, ship } = useShipThread(thread);
  const account = useGithubAccount();
  // The newest pull request is the one an update goes to.
  const [latest] = thread.pullRequests;
  const shipped = latest !== undefined;
  const canUpdate = latest?.state === "open";
  const label = shipLabel(latest);
  const blocked = thread.running || shipping || (shipped && upToDate);
  // What is shipped is the person's own on GitHub, so their account has to be connected first.
  if (account?.data && !account.data.connected) {
    const next = encodeURIComponent(`/threads/${thread.id}`);
    return (
      <Button
        size="sm"
        className="shadow-md"
        nativeButton={false}
        render={<a href={`/api/github/connect?next=${next}`} />}
      >
        <Github />
        Connect GitHub to ship
      </Button>
    );
  }
  return (
    <>
      {latest && (
        <Button
          variant="secondary"
          size="sm"
          className="shadow-md"
          nativeButton={false}
          role="link"
          render={<a href={latest.url} target="_blank" rel="noreferrer" />}
        >
          #{latest.number}
          <ExternalLink />
        </Button>
      )}
      <ButtonGroup>
        <Button
          variant={shipped ? "outline" : "default"}
          size="sm"
          className="shadow-md"
          disabled={blocked}
          title={shipped && upToDate ? "Nothing new since the last push" : undefined}
          onClick={() => void ship()}
        >
          <Rocket />
          {shipping ? "Shipping…" : label}
        </Button>
        {(canUpdate || thread.pullRequests.length > 1) && (
          <ShipMenu
            pullRequests={thread.pullRequests}
            canUpdate={canUpdate}
            disabled={blocked}
            onNew={() => void ship("new")}
          />
        )}
      </ButtonGroup>
    </>
  );
}

// Update while the newest pull request is open; otherwise the work goes into a new one.
function shipLabel(latest: ThreadPullRequest | undefined) {
  if (!latest) return "Ship";
  return latest.state === "open" ? "Update PR" : "New PR";
}
