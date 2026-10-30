import { ExternalLink, Rocket } from "@mynaui/icons-react";

import { Button } from "@/components/button";

import { useShipThread } from "../hooks/use-ship-thread";
import type { Thread } from "../types";

type Props = { thread: Thread };

// Ships the thread as a pull request; once there is one, it links to it and ships again as an update.
export function ShipButton({ thread }: Props) {
  const { shipping, ship } = useShipThread(thread);
  const shipped = thread.pullRequestUrl !== null;
  const label = shipped ? "Update PR" : "Ship";
  return (
    <>
      {thread.pullRequestUrl && (
        <Button
          variant="ghost"
          size="sm"
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
        disabled={thread.running || shipping}
        onClick={() => void ship()}
      >
        <Rocket />
        {shipping ? "Shipping…" : label}
      </Button>
    </>
  );
}
