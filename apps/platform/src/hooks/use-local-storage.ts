import { useEffect, useState } from "react";

// localStorage can be missing or throw (private windows, blocked site data); the UI then simply
// does not remember anything.
export const safeStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembering is fine.
    }
  },
};

// State kept in localStorage as JSON: read once on mount, written on every change.
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = safeStorage.getItem(key);
    if (raw === null) return initial;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    safeStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}
