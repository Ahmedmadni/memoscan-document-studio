import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDoc, getDoc, getPage, getPages, putDoc, putPage, type PageRecord } from "@/lib/db";
import { movePage, reorderPages } from "@/lib/docOps";
import { defaultSettings } from "@/lib/imaging";
import { PendingDeletes } from "@/lib/pendingDeletes";

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
function page(id: string, docId: string): PageRecord {
  return {
    id,
    docId,
    original: blob(),
    processed: blob(),
    thumb: "",
    width: 1,
    height: 1,
    settings: defaultSettings(),
    autoDetected: false,
    createdAt: 0,
  };
}

async function seedDoc(ids: string[]) {
  const doc = await createDoc("Test");
  for (const id of ids) await putPage(page(id, doc.id));
  await putDoc({ ...doc, pageIds: ids });
  return (await getDoc(doc.id))!;
}

describe("PendingDeletes committed lifecycle", () => {
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("detaches, undoes and keeps both order and image after timeout", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const manager = new PendingDeletes();
    expect((await manager.remove(doc.id, "b"))!.pageIds).toEqual(["a", "c"]);
    expect((await manager.restore("b"))!.pageIds).toEqual(["a", "b", "c"]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await getPage("b")).toBeDefined();
    await manager.dispose();
  });
  it("finalizes once after a committed removal", async () => {
    const doc = await seedDoc(["a", "b"]);
    fakeTimers();
    const manager = new PendingDeletes();
    await manager.remove(doc.id, "b");
    expect(await manager.remove(doc.id, "b")).toBeNull();
    await vi.advanceTimersByTimeAsync(6000);
    expect(await getPage("b")).toBeUndefined();
    expect(await manager.finalize("b")).toBe(false);
    expect(await manager.restore("b")).toBeNull();
    await manager.dispose();
  });
  it("restores into the current order after another page moves", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const manager = new PendingDeletes();
    const next = (await manager.remove(doc.id, "b"))!;
    await putDoc({ ...next, pageIds: movePage(next.pageIds, 0, 1) });
    expect((await manager.restore("b"))!.pageIds).toEqual(["c", "b", "a"]);
    await manager.dispose();
  });
  it("restores only the requested page with multiple pending removals", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const manager = new PendingDeletes();
    await manager.remove(doc.id, "b");
    await manager.remove(doc.id, "c");
    await manager.restore("c");
    await vi.advanceTimersByTimeAsync(6000);
    expect(await getPage("b")).toBeUndefined();
    expect(await getPage("c")).toBeDefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "c"]);
    await manager.dispose();
  });
  it("finalizes on navigation without removing retained records", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const manager = new PendingDeletes();
    await manager.remove(doc.id, "b");
    await manager.dispose();
    await manager.dispose();
    await vi.advanceTimersByTimeAsync(10000);
    const reopened = (await getDoc(doc.id))!;
    expect((await getPages(reopened)).map((p) => p.id)).toEqual(["a", "c"]);
  });
  it("never starts a timer if the document write aborts after request success", async () => {
    const doc = await seedDoc(["a", "b"]);
    fakeTimers();
    const manager = new PendingDeletes();
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      const req = real.apply(this, args);
      if (this.name === "docs")
        req.addEventListener("success", () => this.transaction.abort(), { once: true });
      return req;
    });
    await expect(manager.remove(doc.id, "b")).rejects.toBeDefined();
    spy.mockRestore();
    expect(manager.size).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    expect(await getPage("b")).toBeDefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "b"]);
    await manager.dispose();
  });
});

describe("reorderPages (drag-and-drop helper)", () => {
  it("moves an item forward and backward", () => {
    expect(reorderPages(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(reorderPages(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });
  it("rejects out-of-range and no-op moves without copying", () => {
    const ids = ["a", "b"];
    expect(reorderPages(ids, -1, 1)).toBe(ids);
    expect(reorderPages(ids, 0, 5)).toBe(ids);
    expect(reorderPages(ids, 1, 1)).toBe(ids);
  });
  it("never duplicates or drops ids", () => {
    const r = reorderPages(["a", "b", "c", "d"], 1, 3);
    expect([...r].sort()).toEqual(["a", "b", "c", "d"]);
  });
});
