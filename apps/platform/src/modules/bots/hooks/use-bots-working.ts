import { useEffect, useState } from "react";

// Which of the person's bots are at work, from the server as it changes (decision 0064): what the
// sidebar draws as open eyes, including a bot that is working while another one's chat is open.
export function useBotsWorking(): ReadonlySet<string> {
  const [working, setWorking] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const source = new EventSource("/api/bots/working");
    source.onmessage = (message) => {
      try {
        const ids: unknown = JSON.parse(message.data);
        if (Array.isArray(ids)) setWorking(new Set(ids.filter((id) => typeof id === "string")));
      } catch {
        // Not a list of ids: left as it was.
      }
    };
    // The browser retries on its own, and the first thing it hears again says who is at work; until
    // then what it cannot tell is not claimed to be going on.
    source.onerror = () => setWorking(new Set());
    return () => source.close();
  }, []);

  return working;
}
