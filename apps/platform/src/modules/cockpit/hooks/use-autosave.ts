import { useCallback, useEffect, useRef } from "react";

/**
 * Saves what is typed a moment after the typing stops, and at once when the editor goes away or
 * moves to another record, so nothing typed is lost (decision 0105). `save` gets the latest value.
 */
export function useAutosave<T>(save: (value: T) => void, delayMs = 700) {
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestSave = useRef(save);
  latestSave.current = save;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const waiting = pending.current;
    pending.current = null;
    if (waiting) latestSave.current(waiting.value);
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush],
  );

  // What is waiting is dropped, as before the record is deleted.
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
  }, []);

  useEffect(() => flush, [flush]);
  return { schedule, flush, cancel };
}
