// A small wrapper around IndexedDB (a bigger, safer store inside the browser).
// Every call is safe: if the browser has no IndexedDB, it quietly does nothing.

const DB_NAME = "taptrack-os";
const STORE = "kv";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        } catch {
          // ignore
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function closeQuietly(db: IDBDatabase) {
  try {
    db.close();
  } catch {
    // ignore
  }
}

export async function idbGet<T = any>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => {
        resolve(r.result as T | undefined);
        closeQuietly(db);
      };
      r.onerror = () => {
        resolve(undefined);
        closeQuietly(db);
      };
    } catch {
      resolve(undefined);
      closeQuietly(db);
    }
  });
}

export async function idbSet(key: string, value: any): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => {
        resolve(true);
        closeQuietly(db);
      };
      tx.onerror = () => {
        resolve(false);
        closeQuietly(db);
      };
      tx.onabort = () => {
        resolve(false);
        closeQuietly(db);
      };
    } catch {
      resolve(false);
      closeQuietly(db);
    }
  });
}
