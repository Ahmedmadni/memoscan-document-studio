import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { expect, it } from "vitest";
import { defaultSettings } from "@/lib/imaging";

it("upgrades an existing v1 database while retaining document order and original image bytes", async () => {
  const legacy = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("memoscan", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("docs", { keyPath: "id" });
      req.result.createObjectStore("pages", { keyPath: "id" }).createIndex("docId", "docId");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = legacy.transaction(["docs", "pages"], "readwrite");
    tx.objectStore("docs").put({
      id: "legacy-doc",
      name: "مستند قديم",
      createdAt: 1,
      updatedAt: 2,
      pageIds: ["legacy-page"],
    });
    tx.objectStore("pages").put({
      id: "legacy-page",
      docId: "legacy-doc",
      original: new NodeBlob(["legacy-original"], { type: "image/jpeg" }),
      processed: new NodeBlob(["processed"], { type: "image/jpeg" }),
      thumb: "",
      width: 1,
      height: 1,
      settings: defaultSettings(),
      autoDetected: false,
      createdAt: 1,
    });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  legacy.close();
  const db = await import("@/lib/db");
  expect((await db.getDoc("legacy-doc"))!.pageIds).toEqual(["legacy-page"]);
  const page = (await db.getPage("legacy-page"))!;
  expect(await page.original.text()).toBe("legacy-original");
  await db.putCaptureDraft({ id: "migration-test", updatedAt: 1, items: [] });
  expect((await db.getCaptureDraft("migration-test"))!.items).toEqual([]);
});
