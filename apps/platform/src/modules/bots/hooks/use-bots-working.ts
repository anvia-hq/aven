import { useEffect, useState } from "react";

export function useBotsWorking(): ReadonlySet<string> {
  const [working, setWorking] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const source = new EventSource("/api/bots/working");
    source.onmessage = (message) => {
      try {
        const ids: unknown = JSON.parse(message.data);
        if (Array.isArray(ids)) setWorking(new Set(ids.filter((id) => typeof id === "string")));
      } catch {}
    };
    source.onerror = () => setWorking(new Set());
    return () => source.close();
  }, []);

  return working;
}
