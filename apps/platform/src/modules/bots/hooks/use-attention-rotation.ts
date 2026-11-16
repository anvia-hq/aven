import { useCallback, useEffect, useState } from "react";

import { ATTENTION_ROTATE_MS } from "../attention";

export function useAttentionRotation(count: number, paused: boolean, reduced: boolean) {
  const [index, setIndex] = useState(0);
  const advance = useCallback(
    () => setIndex((current) => (count > 0 ? (current + 1) % count : 0)),
    [count],
  );

  useEffect(() => {
    setIndex((current) => (count > 0 ? current % count : 0));
  }, [count]);

  useEffect(() => {
    if (!reduced || paused || count <= 1) return;

    const timer = setInterval(advance, ATTENTION_ROTATE_MS);
    return () => clearInterval(timer);
  }, [advance, paused, reduced, count]);

  return { index, advance };
}
