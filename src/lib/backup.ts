import { z } from "zod";
import { documentSnapshot, restoreDocuments, uid, type DocRecord, type PageRecord } from "./db";
import { sha256 } from "./sha256";

const MAGIC = new TextEncoder().encode("WARAQ1\r\n");
const HEADER_SIZE = 44;
const MAX_FILE_SIZE = 512 * 1024 * 1024;
const MAX_MANIFEST = 16 * 1024 * 1024;
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const settings = z.object({
  corners: z.tuple([point, point, point, point]),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  angle: z.number().min(-15).max(15),
  filter: z.enum(["original", "magic", "enhance", "gray", "bw", "clean", "paper", "text"]),
  brightness: z.number().min(-100).max(100),
  contrast: z.number().min(-100).max(100),
  sharpen: z.number().min(0).max(100),
  threshold: z.number().min(0).max(30),
  curvedEdges: z.boolean().optional(),
});
const id = z.string().min(1).max(160);
const timestamp = z.number().finite().nonnegative();
const docSchema = z.object({
  id,
  name: z.string().min(1).max(500),
  createdAt: timestamp,
  updatedAt: timestamp,
  pageIds: z.array(id).max(1000),
  category: z.enum(["contracts", "invoices", "ids", "signed"]).optional(),
  notes: z.string().max(2_000_000).optional(),
});
const pageSchema = z.object({
  id,
  docId: id,
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  settings,
  thumb: z
    .string()
    .max(300_000)
    .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  autoDetected: z.boolean(),
  createdAt: timestamp,
  originalAsset: z.number().int().nonnegative(),
  processedAsset: z.number().int().nonnegative(),
});
const manifestSchema = z.object({
  format: z.literal("waraqah"),
  version: z.literal(1),
  exportedAt: z.string(),
  docs: z.array(docSchema).max(1000),
  pages: z.array(pageSchema).max(1000),
  assets: z
    .array(
      z.object({
        size: z
          .number()
          .int()
          .positive()
          .max(100 * 1024 * 1024),
        type: z.enum([
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/avif",
          "image/gif",
          "image/bmp",
        ]),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .max(2000),
});
type Manifest = z.infer<typeof manifestSchema>;
export type PreparedBackup = { docs: DocRecord[]; pages: PageRecord[] };
const invalid = () => new Error("BACKUP_INVALID");
export async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (blob.arrayBuffer) return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/** Versioned binary archive: checksummed JSON manifest followed by checksummed image blobs. */
export async function createDocumentBackup(
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const snapshot = await documentSnapshot();
  const records = new Map(snapshot.pages.map((page) => [page.id, page]));
  const manifest: Manifest = {
    format: "waraqah",
    version: 1,
    exportedAt: new Date().toISOString(),
    docs: snapshot.docs,
    pages: [],
    assets: [],
  };
  const chunks: Blob[] = [];
  const total = snapshot.docs.reduce((sum, doc) => sum + doc.pageIds.length, 0);
  let bytes = 0;
  async function asset(blob: Blob) {
    bytes += blob.size;
    if (bytes > MAX_FILE_SIZE) throw new Error("BACKUP_TOO_LARGE");
    const index = manifest.assets.length;
    manifest.assets.push({
      size: blob.size,
      type: blob.type as Manifest["assets"][number]["type"],
      sha256: await sha256(await blobBytes(blob)),
    });
    chunks.push(blob);
    return index;
  }
  for (const doc of snapshot.docs)
    for (const pageId of doc.pageIds) {
      const page = records.get(pageId);
      if (!page || page.docId !== doc.id) throw new Error("BACKUP_INCOMPLETE");
      const { original, processed, ...metadata } = page;
      manifest.pages.push({
        ...metadata,
        originalAsset: await asset(original),
        processedAsset: await asset(processed),
      });
      onProgress?.(manifest.pages.length, total);
    }
  if (!manifestSchema.safeParse(manifest).success) throw new Error("BACKUP_INCOMPLETE");
  const metadata = new TextEncoder().encode(JSON.stringify(manifest));
  if (
    metadata.byteLength > MAX_MANIFEST ||
    bytes + metadata.byteLength + HEADER_SIZE > MAX_FILE_SIZE
  )
    throw new Error("BACKUP_TOO_LARGE");
  const header = new Uint8Array(HEADER_SIZE);
  header.set(MAGIC);
  new DataView(header.buffer).setUint32(8, metadata.byteLength, true);
  const digest = await sha256(metadata);
  header.set(
    Uint8Array.from(digest.match(/../g)!, (x) => parseInt(x, 16)),
    12,
  );
  return new Blob([header.buffer, metadata.buffer, ...chunks], {
    type: "application/octet-stream",
  });
}

/** Validate everything before opening any writable database transaction. */
export async function inspectDocumentBackup(
  file: Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<PreparedBackup> {
  if (file.size > MAX_FILE_SIZE) throw new Error("BACKUP_TOO_LARGE");
  if (file.size < HEADER_SIZE) throw invalid();
  const header = await blobBytes(file.slice(0, HEADER_SIZE));
  if (!MAGIC.every((value, i) => header[i] === value)) throw invalid();
  const length = new DataView(header.buffer, header.byteOffset).getUint32(8, true);
  if (length > MAX_MANIFEST || HEADER_SIZE + length > file.size) throw invalid();
  const bytes = await blobBytes(file.slice(HEADER_SIZE, HEADER_SIZE + length));
  const expected = Array.from(header.slice(12), (x) => x.toString(16).padStart(2, "0")).join("");
  if ((await sha256(bytes)) !== expected) throw invalid();
  let manifest: Manifest;
  try {
    manifest = manifestSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    throw invalid();
  }
  const docs = new Map(manifest.docs.map((doc) => [doc.id, doc]));
  const pages = new Map(manifest.pages.map((page) => [page.id, page]));
  if (docs.size !== manifest.docs.length || pages.size !== manifest.pages.length) throw invalid();
  const linked = new Set<string>();
  for (const doc of docs.values())
    for (const pageId of doc.pageIds) {
      if (linked.has(pageId) || pages.get(pageId)?.docId !== doc.id) throw invalid();
      linked.add(pageId);
    }
  if (linked.size !== pages.size) throw invalid();
  let offset = HEADER_SIZE + length;
  const blobs: Blob[] = [];
  for (const asset of manifest.assets) {
    if (offset + asset.size > file.size) throw invalid();
    const blob = file.slice(offset, offset + asset.size, asset.type);
    if ((await sha256(await blobBytes(blob))) !== asset.sha256) throw invalid();
    blobs.push(blob);
    offset += asset.size;
    onProgress?.(blobs.length, manifest.assets.length);
  }
  if (offset !== file.size) throw invalid();
  const used = new Set<number>();
  const restoredPages = manifest.pages.map(({ originalAsset, processedAsset, ...page }) => {
    if (!blobs[originalAsset] || !blobs[processedAsset]) throw invalid();
    used.add(originalAsset);
    used.add(processedAsset);
    return {
      ...page,
      settings: { ...page.settings, curvedEdges: page.settings.curvedEdges ?? false },
      original: blobs[originalAsset],
      processed: blobs[processedAsset],
    };
  });
  if (used.size !== blobs.length) throw invalid();
  return { docs: manifest.docs, pages: restoredPages };
}

/** Add restored copies with fresh IDs; existing documents remain intact. */
export async function restoreDocumentBackup(prepared: PreparedBackup) {
  const docIds = new Map(prepared.docs.map((doc) => [doc.id, uid()]));
  const pageIds = new Map(prepared.pages.map((page) => [page.id, uid()]));
  const docs = prepared.docs.map((doc) => ({
    ...doc,
    id: docIds.get(doc.id)!,
    pageIds: doc.pageIds.map((id) => pageIds.get(id)!),
  }));
  const pages = prepared.pages.map((page) => ({
    ...page,
    id: pageIds.get(page.id)!,
    docId: docIds.get(page.docId)!,
  }));
  await restoreDocuments(docs, pages);
  return { documents: docs.length, pages: pages.length };
}
