import { useEffect, useState } from "react";

import { pauseMs, pickWord } from "../working-words";

// The word the working indicator shows and the one it just replaced (for the blur out), changing
// at a random interval for as long as the indicator is on screen.
export function useWorkingWord() {
  const [words, setWords] = useState<{ current: string; previous: string | null }>(() => ({
    current: pickWord(undefined),
    previous: null,
  }));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      setWords(({ current }) => ({ current: pickWord(current), previous: current }));
      timer = setTimeout(next, pauseMs());
    };
    timer = setTimeout(next, pauseMs());
    return () => clearTimeout(timer);
  }, []);

  return words;
}
