import { getDoc, putDoc, putPage, type DocRecord } from "./db";
import { buildPage } from "./pages";

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
): Promise<ImportResult> {
  let added = 0;
  let failed = 0;
  let firstError: unknown;
  const newIds: string[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const page = await buildPage(docId, files[i]);
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
