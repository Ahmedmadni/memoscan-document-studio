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
