import { useEffect, useState } from "react";

export const safeStorage = {
  getItem(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  removeItem(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
  setItem(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};

function parseStored<T>(raw: string | null, initial: T): T {
  if (raw === null) return initial;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function serializeStored<T>(value: T) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => parseStored(safeStorage.getItem(key), initial));
  const [loadedKey, setLoadedKey] = useState(key);

  if (loadedKey !== key) {
    setLoadedKey(key);
    setValue(parseStored(safeStorage.getItem(key), initial));
  }

  useEffect(() => {
    const raw = serializeStored(value);

    if (raw === null || raw === safeStorage.getItem(key)) return;

    safeStorage.setItem(key, raw);
  }, [key, value]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === null || event.key === key) setValue(parseStored(event.newValue, initial));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, initial]);

  return [value, setValue] as const;
}
