import { useEffect, useState } from "react";

import { api } from "@/lib/api";

// Project paths this organization has used before, most recent first.
export function useRecentPaths() {
  const [paths, setPaths] = useState<string[]>([]);

  useEffect(() => {
    api<string[]>("/threads/paths")
      .then(setPaths)
      .catch(() => setPaths([]));
  }, []);

  return paths;
}
