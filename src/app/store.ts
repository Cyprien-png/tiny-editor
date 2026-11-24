/**
 * The document being edited, kept on the device (IndexedDB): the PDF as it was opened and its annotations, so that
 * closing the tab or the application loses nothing. One document at a time: opening another one replaces it.
 */
import type { Annotations } from "../lib/annotations";

export interface Session {
  name: string;
  bytes: ArrayBuffer;
  annotations: Annotations;
}

const DB = "tiny-editor";
const STORE = "session";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function loadSession(): Promise<Session | undefined> {
  const file = await run<{ name: string; bytes: ArrayBuffer } | undefined>("readonly", (store) => store.get("file"));
  if (!file?.bytes) return undefined;
  const annotations = await run<Annotations | undefined>("readonly", (store) => store.get("annotations"));
  return { name: file.name, bytes: file.bytes, annotations: annotations ?? {} };
}

/** A newly opened PDF: it replaces the previous document and its annotations. */
export async function storeFile(name: string, bytes: ArrayBuffer): Promise<void> {
  await run("readwrite", (store) => {
    store.put({ name, bytes }, "file");
    store.put({}, "annotations");
  });
}

export async function storeAnnotations(annotations: Annotations): Promise<void> {
  await run("readwrite", (store) => void store.put(annotations, "annotations"));
}

export async function clearSession(): Promise<void> {
  await run("readwrite", (store) => void store.clear());
}
