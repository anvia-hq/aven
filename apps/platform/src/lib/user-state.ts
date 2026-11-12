const clears = new Set<() => void>();

const UNSIGNED = "unsigned";

function removeStored(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function storedKeys(): string[] {
  try {
    const keys: string[] = [];
    for (let at = 0; at < localStorage.length; at += 1) {
      const key = localStorage.key(at);

      if (key !== null) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

export function registerUserState(clear: () => void) {
  clears.add(clear);
}

export function clearUserState() {
  for (const clear of clears) {
    try {
      clear();
    } catch {}
  }
}

export function accountKey(account: string | null, key: string) {
  return `${account ?? UNSIGNED}\0${key}`;
}

export function forgetStoredKeys(keys: readonly string[]) {
  for (const key of keys) removeStored(key);
}

export function forgetStoredKeysStartingWith(prefix: string) {
  for (const key of storedKeys()) if (key.startsWith(prefix)) removeStored(key);
}
