import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDoc,
  putDoc,
  putPage,
  getDoc,
  getPages,
  deleteDoc,
  documentSnapshot,
  restoreDocuments,
  getCaptureDraft,
  putCaptureDraft,
  deleteCaptureDraft,
  appendPage,
  linkCaptureDraft,
  type PageRecord,
} from "@/lib/db";
import {
  createDocumentBackup,
  inspectDocumentBackup,
  restoreDocumentBackup,
  blobBytes,
} from "@/lib/backup";
import { defaultSettings } from "@/lib/imaging";

afterEach(async () => {
  for (const doc of (await documentSnapshot()).docs) await deleteDoc(doc.id);
  vi.unstubAllGlobals();
});
const setupBlobs = () => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("File", NodeFile);
};
async function seed() {
  setupBlobs();
  const doc = await createDoc("فاتورة أصلية", "invoices");
  const settings = { ...defaultSettings(), brightness: 17, contrast: -8, rotation: 90 as const };
  const page: PageRecord = {
    id: `page-${doc.id}`,
    docId: doc.id,
    original: new Blob(["ORIGINAL"], { type: "image/png" }),
    processed: new Blob(["PROCESSED"], { type: "image/jpeg" }),
    thumb: "data:image/jpeg;base64,AQID",
    width: 400,
    height: 600,
    settings,
    autoDetected: false,
    createdAt: 1,
  };
  await putPage(page);
  await putDoc({ ...doc, pageIds: [page.id], notes: "ملاحظة للاختبار" });
  return { doc, page };
}
describe("complete document backup", () => {
  it("does not duplicate a committed camera page when a draft import is retried", async () => {
    const { doc, page } = await seed();
    const capture = { ...page, id: "capture-once", captureKey: "session:photo-1" };
    await appendPage(capture);
    await appendPage({ ...capture, id: "retry-new-id" });
    const current = (await getDoc(doc.id))!;
    expect(current.pageIds).toEqual([page.id, "capture-once"]);
    expect((await documentSnapshot()).pages.filter((p) => p.docId === doc.id)).toHaveLength(2);
  });
  it("restores original bytes, edited bytes, order, settings and notes as independent copies", async () => {
    const { doc, page } = await seed();
    const backup = await createDocumentBackup();
    const prepared = await inspectDocumentBackup(backup);
    await restoreDocumentBackup(prepared);
    const snapshot = await documentSnapshot();
    expect(snapshot.docs).toHaveLength(2);
    const restored = snapshot.docs.find((d) => d.id !== doc.id)!;
    expect(restored.notes).toBe("ملاحظة للاختبار");
    expect(restored.category).toBe("invoices");
    const [copy] = await getPages(restored);
    expect(copy.id).not.toBe(page.id);
    expect(copy.docId).toBe(restored.id);
    expect(new TextDecoder().decode(await blobBytes(copy.original))).toBe("ORIGINAL");
    expect(new TextDecoder().decode(await blobBytes(copy.processed))).toBe("PROCESSED");
    expect(copy.settings).toMatchObject(page.settings);
    expect((await getDoc(doc.id))!.pageIds).toEqual([page.id]);
  });
  it("rejects corruption, truncation and a metadata-only JSON without writing anything", async () => {
    await seed();
    const backup = await createDocumentBackup();
    const bytes = await blobBytes(backup);
    bytes[bytes.length - 1] ^= 1;
    await expect(inspectDocumentBackup(new Blob([new Uint8Array(bytes).buffer]))).rejects.toThrow(
      "BACKUP_INVALID",
    );
    await expect(inspectDocumentBackup(backup.slice(0, backup.size - 2))).rejects.toThrow(
      "BACKUP_INVALID",
    );
    await expect(inspectDocumentBackup(new Blob(['{"documents":[]}']))).rejects.toThrow(
      "BACKUP_INVALID",
    );
    expect((await documentSnapshot()).docs).toHaveLength(1);
  });
  it("rolls back a whole restore if any image record cannot be committed", async () => {
    const { doc, page } = await seed();
    const other = { ...doc, id: "restore-conflict", pageIds: [page.id] };
    await expect(restoreDocuments([other], [page])).rejects.toBeDefined();
    expect(await getDoc(other.id)).toBeUndefined();
    expect((await getPages((await getDoc(doc.id))!))[0].docId).toBe(doc.id);
  });
  it("refuses an incomplete source document rather than exporting a misleading backup", async () => {
    const { doc } = await seed();
    await putDoc({ ...doc, pageIds: ["missing"] });
    await expect(createDocumentBackup()).rejects.toThrow("BACKUP_INCOMPLETE");
  });
  it("persists and removes a capture draft with page-specific approval and adjustments", async () => {
    setupBlobs();
    const file = new File(["capture"], "page.jpg", { type: "image/jpeg" });
    await putCaptureDraft({
      id: "test-draft",
      updatedAt: 1,
      items: [
        {
          file,
          name: file.name,
          settings: { ...defaultSettings(), brightness: 23 },
          approved: true,
        },
      ],
    });
    await linkCaptureDraft("test-draft", "existing-document");
    await putCaptureDraft({
      id: "test-draft",
      updatedAt: 2,
      items: (await getCaptureDraft("test-draft"))!.items,
    });
    const draft = await getCaptureDraft("test-draft");
    expect(draft!.destinationDocId).toBe("existing-document");
    expect(draft!.items[0].settings.brightness).toBe(23);
    expect(draft!.items[0].approved).toBe(true);
    expect(new TextDecoder().decode(await blobBytes(draft!.items[0].file))).toBe("capture");
    await deleteCaptureDraft("test-draft");
    expect(await getCaptureDraft("test-draft")).toBeUndefined();
  });
});
