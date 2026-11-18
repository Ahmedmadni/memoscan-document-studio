// Local persistence in IndexedDB. Browser-only: call from effects/handlers.
import type { EditSettings } from "./imaging";

export type DocCategory = "contracts" | "invoices" | "ids" | "signed";

export interface DocRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageIds: string[];
  category?: DocCategory | undefined;
  notes?: string | undefined;
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
  captureKey?: string | undefined;
}

const DB_NAME = "memoscan";
const VERSION = 2;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("NO_INDEXEDDB"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    let blocked = false;
    req.onblocked = () => {
      blocked = true;
      dbPromise = null;
      reject(new Error("STORAGE_BUSY"));
    };
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("docs")) db.createObjectStore("docs", { keyPath: "id" });
      if (!db.objectStoreNames.contains("pages")) {
        const s = db.createObjectStore("pages", { keyPath: "id" });
        s.createIndex("docId", "docId");
      }
      const pages = req.transaction!.objectStore("pages");
      if (!pages.indexNames.contains("capture"))
        pages.createIndex("capture", ["docId", "captureKey"]);
      if (!db.objectStoreNames.contains("drafts"))
        db.createObjectStore("drafts", { keyPath: "id" });
    };
    req.onsuccess = () => {
      if (blocked) {
        req.result.close();
        return;
      }
      req.result.onversionchange = () => {
        req.result.close();
        dbPromise = null;
      };
      resolve(req.result);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

type StoreName = "docs" | "pages" | "drafts";
/** Resolve writes only after commit; related records share the same transaction. */
async function transaction<T>(
  names: StoreName[],
  mode: IDBTransactionMode,
  queue: (tx: IDBTransaction, done: (value: T) => void, fail: (error: Error) => void) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result: T;
    let failure: Error | null = null;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("STORAGE_WRITE_FAILED"));
    tx.onerror = () => {
      /* the abort event reports the failed commit */
    };
    const fail = (error: Error) => {
      failure = error;
      tx.abort();
    };
    try {
      queue(
        tx,
        (value) => {
          result = value;
        },
        fail,
      );
    } catch (error) {
      fail(error instanceof Error ? error : new Error("STORAGE_WRITE_FAILED"));
    }
  });
}

function read<T>(name: StoreName, request: (store: IDBObjectStore) => IDBRequest<T>) {
  return transaction<T>([name], "readonly", (tx, done) => {
    const req = request(tx.objectStore(name));
    req.onsuccess = () => done(req.result);
  });
}
function write(name: StoreName, queue: (store: IDBObjectStore) => void) {
  return transaction<void>([name], "readwrite", (tx) => queue(tx.objectStore(name)));
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export async function listDocs(): Promise<DocRecord[]> {
  const all = await read("docs", (store) => store.getAll() as IDBRequest<DocRecord[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDoc(id: string) {
  return read("docs", (store) => store.get(id) as IDBRequest<DocRecord | undefined>);
}

export async function putDoc(doc: DocRecord) {
  await write("docs", (store) => {
    store.put(doc);
  });
}

export async function createDoc(name: string, category?: DocCategory): Promise<DocRecord> {
  const now = Date.now();
  const doc: DocRecord = {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    pageIds: [],
    ...(category ? { category } : {}),
  };
  await putDoc(doc);
  return doc;
}

export async function getPage(id: string) {
  return read("pages", (store) => store.get(id) as IDBRequest<PageRecord | undefined>);
}

export async function putPage(p: PageRecord) {
  await write("pages", (store) => {
    store.put(p);
  });
}

export async function deletePage(id: string) {
  await write("pages", (store) => {
    store.delete(id);
  });
}

export async function getPages(doc: DocRecord): Promise<PageRecord[]> {
  const pages = await Promise.all(doc.pageIds.map(getPage));
  return pages.filter((p): p is PageRecord => !!p);
}

export async function deleteDoc(id: string) {
  await transaction<void>(["docs", "pages", "drafts"], "readwrite", (tx) => {
    const pages = tx.objectStore("pages");
    const keys = pages.index("docId").getAllKeys(id);
    keys.onsuccess = () => {
      keys.result.forEach((key) => pages.delete(key));
    };
    tx.objectStore("docs").delete(id);
    tx.objectStore("drafts").delete(`doc:${id}`);
  });
}

export function appendPage(page: PageRecord, afterId?: string) {
  return transaction<DocRecord>(["docs", "pages"], "readwrite", (tx, done, fail) => {
    const docs = tx.objectStore("docs");
    const req = docs.get(page.docId) as IDBRequest<DocRecord | undefined>;
    req.onsuccess = () => {
      const doc = req.result;
      if (!doc) {
        fail(new Error("DOCUMENT_NOT_FOUND"));
        return;
      }
      const commit = (existing?: PageRecord) => {
        const record = existing ?? page;
        if (existing && doc.pageIds.includes(existing.id)) {
          done(doc);
          return;
        }
        const pageIds = doc.pageIds.filter((id) => id !== record.id);
        const index = afterId ? pageIds.indexOf(afterId) : -1;
        pageIds.splice(index < 0 ? pageIds.length : index + 1, 0, record.id);
        const next = { ...doc, pageIds, updatedAt: Date.now() };
        tx.objectStore("pages").put(record);
        docs.put(next);
        done(next);
      };
      if (page.captureKey) {
        const existing = tx
          .objectStore("pages")
          .index("capture")
          .get([page.docId, page.captureKey]) as IDBRequest<PageRecord | undefined>;
        existing.onsuccess = () => commit(existing.result);
      } else commit();
    };
  });
}

export function detachPage(docId: string, pageId: string) {
  return transaction<{ doc: DocRecord; index: number } | null>(
    ["docs"],
    "readwrite",
    (tx, done) => {
      const store = tx.objectStore("docs");
      const req = store.get(docId) as IDBRequest<DocRecord | undefined>;
      req.onsuccess = () => {
        const doc = req.result;
        const index = doc?.pageIds.indexOf(pageId) ?? -1;
        if (!doc || index < 0) {
          done(null);
          return;
        }
        const next = {
          ...doc,
          pageIds: doc.pageIds.filter((id) => id !== pageId),
          updatedAt: Date.now(),
        };
        store.put(next);
        done({ doc: next, index });
      };
    },
  );
}

/** A failed deletion or an undo can never erase a referenced page. */
export function deleteDetachedPage(pageId: string) {
  return transaction<boolean>(["docs", "pages"], "readwrite", (tx, done) => {
    const pages = tx.objectStore("pages");
    const page = pages.get(pageId) as IDBRequest<PageRecord | undefined>;
    page.onsuccess = () => {
      if (!page.result) {
        done(false);
        return;
      }
      const req = tx.objectStore("docs").get(page.result.docId) as IDBRequest<
        DocRecord | undefined
      >;
      req.onsuccess = () => {
        if (req.result?.pageIds.includes(pageId)) {
          done(false);
          return;
        }
        pages.delete(pageId);
        done(true);
      };
    };
  });
}

export function restoreDetachedPage(docId: string, pageId: string, index: number) {
  return transaction<DocRecord | null>(["docs", "pages"], "readwrite", (tx, done) => {
    const pages = tx.objectStore("pages").get(pageId) as IDBRequest<PageRecord | undefined>;
    pages.onsuccess = () => {
      if (pages.result?.docId !== docId) {
        done(null);
        return;
      }
      const docs = tx.objectStore("docs");
      const req = docs.get(docId) as IDBRequest<DocRecord | undefined>;
      req.onsuccess = () => {
        if (!req.result) {
          done(null);
          return;
        }
        const pageIds = req.result.pageIds.filter((id) => id !== pageId);
        pageIds.splice(Math.max(0, Math.min(index, pageIds.length)), 0, pageId);
        const next = { ...req.result, pageIds, updatedAt: Date.now() };
        docs.put(next);
        done(next);
      };
    };
  });
}

export function documentSnapshot() {
  return transaction<{ docs: DocRecord[]; pages: PageRecord[] }>(
    ["docs", "pages"],
    "readonly",
    (tx, done) => {
      const result = { docs: [] as DocRecord[], pages: [] as PageRecord[] };
      const docs = tx.objectStore("docs").getAll() as IDBRequest<DocRecord[]>;
      const pages = tx.objectStore("pages").getAll() as IDBRequest<PageRecord[]>;
      docs.onsuccess = () => {
        result.docs = docs.result;
      };
      pages.onsuccess = () => {
        result.pages = pages.result;
      };
      done(result);
    },
  );
}

export function restoreDocuments(docs: DocRecord[], pages: PageRecord[]) {
  return transaction<void>(["docs", "pages"], "readwrite", (tx) => {
    docs.forEach((doc) => tx.objectStore("docs").add(doc));
    pages.forEach((page) => tx.objectStore("pages").add(page));
  });
}

export function savePageEdits(docId: string, pages: PageRecord[]) {
  return transaction<void>(["docs", "pages"], "readwrite", (tx, _done, fail) => {
    const store = tx.objectStore("docs");
    const req = store.get(docId) as IDBRequest<DocRecord | undefined>;
    req.onsuccess = () => {
      const doc = req.result;
      if (!doc) {
        fail(new Error("DOCUMENT_NOT_FOUND"));
        return;
      }
      for (const page of pages) {
        if (page.docId === docId && doc.pageIds.includes(page.id))
          tx.objectStore("pages").put(page);
      }
      store.put({ ...doc, updatedAt: Date.now() });
    };
  });
}

export interface CaptureDraft {
  id: string;
  updatedAt: number;
  destinationDocId?: string;
  items: {
    file: File;
    name?: string;
    lastModified?: number;
    settings: EditSettings;
    approved: boolean;
  }[];
}
export const getCaptureDraft = (id: string) =>
  read("drafts", (store) => store.get(id) as IDBRequest<CaptureDraft | undefined>);
export const putCaptureDraft = (draft: CaptureDraft) =>
  transaction<void>(["drafts"], "readwrite", (tx) => {
    const store = tx.objectStore("drafts");
    const req = store.get(draft.id) as IDBRequest<CaptureDraft | undefined>;
    req.onsuccess = () =>
      store.put({
        ...draft,
        ...(req.result?.destinationDocId ? { destinationDocId: req.result.destinationDocId } : {}),
      });
  });
export function linkCaptureDraft(id: string, docId: string) {
  return transaction<void>(["drafts"], "readwrite", (tx) => {
    const store = tx.objectStore("drafts");
    const req = store.get(id) as IDBRequest<CaptureDraft | undefined>;
    req.onsuccess = () => {
      if (req.result) store.put({ ...req.result, destinationDocId: docId });
    };
  });
}
export const deleteCaptureDraft = (id: string) =>
  write("drafts", (store) => {
    store.delete(id);
  });

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted()))
      await navigator.storage.persist();
  } catch {
    /* not supported */
  }
}
