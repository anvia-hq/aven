import { ExternalLink, Github, Rocket } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { useGithubAccount } from "@/modules/projects/hooks/use-github-account";

import { useShipThread } from "../hooks/use-ship-thread";
import type { Thread } from "../types";

type Props = {
  thread: Thread;
  /** Whether the pull request already has everything the thread changed; there is nothing to update. */
  upToDate: boolean;
};

// Ships the thread as a pull request, as the person; once there is one, it links to it and ships
// again as an update.
export function ShipButton({ thread, upToDate }: Props) {
  const { shipping, ship } = useShipThread(thread);
  const account = useGithubAccount();
  const shipped = thread.pullRequestUrl !== null;
  const label = shipped ? "Update PR" : "Ship";
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
      {thread.pullRequestUrl && (
        <Button
          variant="secondary"
          size="sm"
          className="shadow-md"
          nativeButton={false}
          role="link"
          render={<a href={thread.pullRequestUrl} target="_blank" rel="noreferrer" />}
        >
          #{thread.pullRequestNumber}
          <ExternalLink />
        </Button>
      )}
      <Button
        variant={shipped ? "outline" : "default"}
        size="sm"
        className="shadow-md"
        disabled={thread.running || shipping || (shipped && upToDate)}
        title={shipped && upToDate ? "Nothing new since the last push" : undefined}
        onClick={() => void ship()}
      >
        <Rocket />
        {shipping ? "Shipping…" : label}
      </Button>
    </>
  );
}
