import { uid, type PageRecord } from "./db";
import {
  canvasToBlob,
  defaultSettings,
  detectDocument,
  loadImageCanvas,
  processPage,
  thumbnailDataUrl,
  type EditSettings,
} from "./imaging";

export const MAX_DIM = 2400;

export async function renderOutputs(original: Blob, settings: EditSettings) {
  const src = await loadImageCanvas(original, MAX_DIM);
  const out = processPage(src, settings, MAX_DIM);
  const processed = await canvasToBlob(out, "image/jpeg", 0.92);
  return { processed, thumb: thumbnailDataUrl(out), width: out.width, height: out.height };
}

/** Decode, auto-detect edges, process, and build a page record (not yet saved). */
export async function buildPage(docId: string, file: Blob, id = uid()): Promise<PageRecord> {
  const src = await loadImageCanvas(file, MAX_DIM);
  const { corners, detected } = detectDocument(src);
  const settings = defaultSettings(corners);
  const out = processPage(src, settings, MAX_DIM);
  // Store a re-encoded original (capped size) so re-editing stays fast.
  const original = await canvasToBlob(src, "image/jpeg", 0.95);
  return {
    id,
    docId,
    original,
    processed: await canvasToBlob(out, "image/jpeg", 0.92),
    thumb: thumbnailDataUrl(out),
    width: out.width,
    height: out.height,
    settings,
    autoDetected: detected,
    createdAt: Date.now(),
  };
}
