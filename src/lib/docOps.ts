import { createDoc, getDoc, getPages, putDoc, putPage, uid, type DocRecord } from "./db";
import type { EditSettings, FilterMode } from "./imaging";
import { buildPage, renderOutputs } from "./pages";

export interface ImportResult {
  added: number;
  failed: number;
  firstError?: unknown;
}

/** Processes files one by one (keeps memory bounded) and appends them to the document. */
export async function addFilesToDoc(
  docId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
  edits?: ReadonlyMap<File, EditSettings>,
): Promise<ImportResult> {
  let added = 0;
  let failed = 0;
  let firstError: unknown;
  const newIds: string[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const page = await buildPage(docId, file, undefined, edits?.get(file));
      await putPage(page);
      newIds.push(page.id);
      added++;
    } catch (e) {
      failed++;
      firstError ??= e;
    }
    onProgress?.(i + 1, files.length);
  }
  const doc = await getDoc(docId);
  if (doc && newIds.length) {
    const next: DocRecord = { ...doc, pageIds: [...doc.pageIds, ...newIds], updatedAt: Date.now() };
    await putDoc(next);
  }
  return { added, failed, firstError };
}

/** Batch-apply a CamScanner filter across every page in a document. */
export async function applyFilterToAllPages(
  docId: string,
  filter: FilterMode,
  onProgress?: (done: number, total: number) => void,
) {
  const doc = await getDoc(docId);
  if (!doc) return;
  const pages = await getPages(doc);
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const settings = { ...p.settings, filter };
    const out = await renderOutputs(p.original, settings);
    await putPage({ ...p, ...out, settings });
    onProgress?.(i + 1, pages.length);
  }
  await putDoc({ ...doc, updatedAt: Date.now() });
}

/** Merge multiple documents into a new multi-page document without altering originals. */
export async function mergeDocuments(docIds: string[], mergedName: string): Promise<DocRecord> {
  const target = await createDoc(mergedName);
  const newPageIds: string[] = [];
  for (const id of docIds) {
    const srcDoc = await getDoc(id);
    if (!srcDoc) continue;
    const pages = await getPages(srcDoc);
    for (const p of pages) {
      const copyId = uid();
      await putPage({ ...p, id: copyId, docId: target.id, createdAt: Date.now() });
      newPageIds.push(copyId);
    }
  }
  const updated: DocRecord = { ...target, pageIds: newPageIds, updatedAt: Date.now() };
  await putDoc(updated);
  return updated;
}

export function defaultDocName(prefix: string, lang: string) {
  const d = new Date();
  return `${prefix} ${d.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB")} ${d.toLocaleTimeString(
    lang === "ar" ? "ar-EG" : "en-GB",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

/** Pure page-order helpers (return new arrays; out-of-range moves are no-ops). */
export function movePage(ids: string[], index: number, delta: number): string[] {
  const to = index + delta;
  if (index < 0 || index >= ids.length || to < 0 || to >= ids.length) return ids;
  const n = [...ids];
  [n[index], n[to]] = [n[to]!, n[index]!];
  return n;
}

export function insertAfter(ids: string[], index: number, id: string): string[] {
  const n = [...ids];
  n.splice(index + 1, 0, id);
  return n;
}

export function removeId(ids: string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

/** Move the id at `from` to position `to` (drag-and-drop reorder). Out-of-range or no-op moves return the same array. */
export function reorderPages(ids: string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return ids;
  const n = [...ids];
  const [moved] = n.splice(from, 1);
  n.splice(to, 0, moved!);
  return n;
}

/** Re-insert an id at its original position, clamped to the current list length. */
export function reinsertAt(ids: string[], index: number, id: string): string[] {
  const n = ids.filter((x) => x !== id);
  n.splice(Math.max(0, Math.min(index, n.length)), 0, id);
  return n;
}
