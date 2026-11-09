import { useAtom } from "jotai";
import { useCallback } from "react";

import { splitPairsAtom } from "../atoms/split-pairs-atom";
import { partnerOf, withoutPair, withPair } from "../split";

export function useSplitPairs() {
  const [pairs, setPairs] = useAtom(splitPairsAtom);
  const pair = useCallback(
    (left: string, right: string) => setPairs((saved) => withPair(saved, left, right)),
    [setPairs],
  );
  const unpair = useCallback(
    (id: string) => setPairs((saved) => withoutPair(saved, id)),
    [setPairs],
  );
  return { pairs, pair, unpair, partnerOf: (id: string) => partnerOf(pairs, id) };
}
