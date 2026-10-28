// Local persistence in IndexedDB. Browser-only: call from effects/handlers.
import type { EditSettings } from "./imaging";

export interface DocRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageIds: string[];
}

export interface PageRecord {
  id: string;
  docId: string;
  original: Blob;
  processed: Blob;
  thumb: string;
  width: number;
  height: number;
  settings: EditSettings;
  autoDetected: boolean;
  createdAt: number;
}

const DB_NAME = "memoscan";
const VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("NO_INDEXEDDB"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pages")) {
        const s = db.createObjectStore("pages", { keyPath: "id" });
        s.createIndex("docId", "docId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>) {
  return new Promise<T>((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function store(name: "docs" | "pages", mode: IDBTransactionMode = "readonly") {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function listDocs(): Promise<DocRecord[]> {
  const all = await wrap((await store("docs")).getAll() as IDBRequest<DocRecord[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string) {
  return wrap((await store("docs")).get(id) as IDBRequest<DocRecord | undefined>);
}

export async function putDoc(doc: DocRecord) {
  await wrap((await store("docs", "readwrite")).put(doc));
}

export async function createDoc(name: string): Promise<DocRecord> {
  const now = Date.now();
  const doc: DocRecord = { id: uid(), name, createdAt: now, updatedAt: now, pageIds: [] };
  await putDoc(doc);
  return doc;
}

export async function getPage(id: string) {
  return wrap((await store("pages")).get(id) as IDBRequest<PageRecord | undefined>);
}

export async function putPage(p: PageRecord) {
  await wrap((await store("pages", "readwrite")).put(p));
}

export async function deletePage(id: string) {
  await wrap((await store("pages", "readwrite")).delete(id));
}

export async function getPages(doc: DocRecord): Promise<PageRecord[]> {
  const pages = await Promise.all(doc.pageIds.map(getPage));
  return pages.filter((p): p is PageRecord => !!p);
}

export async function deleteDoc(id: string) {
  const s = await store("pages", "readwrite");
  const keys = await wrap(s.index("docId").getAllKeys(id));
  const s2 = await store("pages", "readwrite");
  await Promise.all(keys.map((k) => wrap(s2.delete(k))));
  await wrap((await store("docs", "readwrite")).delete(id));
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
