import { safeStorage } from "@/hooks/use-local-storage";
import { forgetStoredKeysStartingWith, registerUserState } from "@/lib/user-state";

import type { DraftFile, DraftFileMeta, DraftRecord, StoredDraftFile } from "./types";

const DRAFT_PREFIX = "aven.thread.";
const DRAFT_SUFFIX = ".draft";
const DRAFT_VERSION = 1;
const DATABASE = "aven.drafts";
const DATABASE_VERSION = 1;
const FILE_STORE = "files";
const THREAD_INDEX = "threadId";

registerUserState(() => {
  forgetStoredKeysStartingWith(DRAFT_PREFIX);
  void forgetAllDraftFiles();
});

export const draftKey = (threadId: string) => `${DRAFT_PREFIX}${threadId}${DRAFT_SUFFIX}`;

const fileKey = (threadId: string, id: string) => `${threadId}\u0000${id}`;

function filesOf(value: unknown): DraftFileMeta[] {
  if (!Array.isArray(value)) return [];

  const kept: DraftFileMeta[] = [];

  for (const item of value as (Partial<DraftFileMeta> | null)[]) {
    if (item === null || typeof item.id !== "string" || typeof item.name !== "string") continue;

    kept.push({
      id: item.id,
      name: item.name,
      type: typeof item.type === "string" ? item.type : "",
      size: typeof item.size === "number" ? item.size : 0,
    });
  }

  return kept;
}

export function readDraft(threadId: string): DraftRecord | null {
  const raw = safeStorage.getItem(draftKey(threadId));

  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DraftRecord>;

    if (typeof parsed.input !== "string") return null;

    return {
      v: DRAFT_VERSION,
      input: parsed.input,
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      files: filesOf(parsed.files),
    };
  } catch {
    return null;
  }
}

export function writeDraft(threadId: string, draft: Omit<DraftRecord, "v">) {
  if (draft.input === "" && draft.files.length === 0) {
    safeStorage.removeItem(draftKey(threadId));
    return;
  }

  safeStorage.setItem(draftKey(threadId), JSON.stringify({ v: DRAFT_VERSION, ...draft }));
}

let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  opening ??= new Promise((resolve) => {
    let request: IDBOpenDBRequest;

    try {
      request = indexedDB.open(DATABASE, DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(FILE_STORE, { keyPath: "key" });
      store.createIndex(THREAD_INDEX, "threadId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return opening;
}

async function ask<T>(
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await database();

  if (db === null) return null;

  try {
    const store = db.transaction(FILE_STORE, mode).objectStore(FILE_STORE);
    return await new Promise<T | null>((resolve) => {
      const request = make(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let lastStamp = 0;

function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

const storedFiles = (threadId: string) =>
  ask(
    "readonly",
    (store) => store.index(THREAD_INDEX).getAll(threadId) as IDBRequest<StoredDraftFile[]>,
  );

export async function readDraftFiles(threadId: string): Promise<DraftFile[]> {
  const records = await storedFiles(threadId);

  return (records ?? []).toSorted((a, b) => a.at - b.at).map(({ id, file }) => ({ id, file }));
}

export async function storeDraftFile(threadId: string, id: string, file: File) {
  const record: StoredDraftFile = {
    key: fileKey(threadId, id),
    threadId,
    id,
    at: stamp(),
    file,
  };
  const stored = await ask("readwrite", (store) => store.put(record));

  return stored !== null;
}

export async function forgetDraftFile(threadId: string, id: string) {
  await ask("readwrite", (store) => store.delete(fileKey(threadId, id)));
}

export async function forgetDraftFiles(threadId: string) {
  const records = await storedFiles(threadId);

  for (const record of records ?? []) {
    await ask("readwrite", (store) => store.delete(record.key));
  }
}

export async function forgetAllDraftFiles() {
  await ask("readwrite", (store) => store.clear());
}

let swept = false;

export async function sweepDraftFiles() {
  if (swept) return;

  swept = true;

  const records = await ask("readonly", (store) => store.getAll() as IDBRequest<StoredDraftFile[]>);

  if (!records?.length) return;

  const kept = new Set<string>();

  for (const threadId of new Set(records.map((record) => record.threadId))) {
    for (const file of readDraft(threadId)?.files ?? []) kept.add(fileKey(threadId, file.id));
  }

  for (const record of records) {
    if (kept.has(record.key)) continue;

    await forgetDraftFile(record.threadId, record.id);
  }
}
