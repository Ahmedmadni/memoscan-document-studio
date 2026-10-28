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

describe("PendingDeletes integration", () => {
  // Fake only the timeout timers — fake-indexeddb needs real scheduling.
  // Enable after seeding so database setup is never stalled.
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  afterEach(() => vi.useRealTimers());

  it("restores the page at its original position when undone before the timeout", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    const next = pd.softDelete(doc.pageIds, "b");
    expect(next).toEqual(["a", "c"]);
    await putDoc({ ...doc, pageIds: next });

    const restored = pd.undo(next, "b");
    expect(restored).toEqual(["a", "b", "c"]);
    await putDoc({ ...doc, pageIds: restored! });

    await vi.advanceTimersByTimeAsync(10000);
    expect(await getPage("b")).toBeDefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "b", "c"]);
    pd.dispose();
  });

  it("permanently removes the page record when the timeout expires", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    const next = pd.softDelete(doc.pageIds, "b");
    await putDoc({ ...doc, pageIds: next });

    await vi.advanceTimersByTimeAsync(6000);
    expect(await getPage("b")).toBeUndefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "c"]);
    // Undo after finalization is a no-op.
    expect(pd.undo(next, "b")).toBeNull();
    pd.dispose();
  });

  it("restores only the undone page when two deletes are pending", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    let order = pd.softDelete(doc.pageIds, "b");
    order = pd.softDelete(order, "c");
    expect(order).toEqual(["a"]);
    await putDoc({ ...doc, pageIds: order });

    const restored = pd.undo(order, "c");
    expect(restored).toEqual(["a", "c"]);
    await putDoc({ ...doc, pageIds: restored! });

    await vi.advanceTimersByTimeAsync(10000);
    expect(await getPage("b")).toBeUndefined();
    expect(await getPage("c")).toBeDefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "c"]);
    pd.dispose();
  });

  it("undo after reordering inserts at the intended index without reverting the reorder", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    let order = pd.softDelete(doc.pageIds, "b"); // ["a", "c"]
    order = movePage(order, 0, 1); // user reorders: ["c", "a"]
    await putDoc({ ...doc, pageIds: order });

    const restored = pd.undo(order, "b");
    expect(restored).toEqual(["c", "b", "a"]);

    await vi.advanceTimersByTimeAsync(10000);
    expect(await getPage("b")).toBeDefined();
    pd.dispose();
  });

  it("duplicate timeouts and repeated finalize calls delete at most once", async () => {
    const doc = await seedDoc(["a", "b"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    pd.softDelete(doc.pageIds, "b");
    // A second softDelete for the same id must not schedule another timer.
    expect(pd.softDelete(doc.pageIds, "b")).toEqual(doc.pageIds);

    await vi.advanceTimersByTimeAsync(6000);
    expect(await getPage("b")).toBeUndefined();
    expect(await pd.finalize("b")).toBe(false);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await getPage("b")).toBeUndefined();
    pd.dispose();
  });

  it("dispose finalizes pending deletes without corrupting the stored order", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    const next = pd.softDelete(doc.pageIds, "b");
    await putDoc({ ...doc, pageIds: next });

    pd.dispose(); // navigate away before the toast ends
    expect(await getPage("b")).toBeUndefined();
    expect((await getDoc(doc.id))!.pageIds).toEqual(["a", "c"]);

    // Timers were cancelled: advancing time must not delete anything else.
    await vi.advanceTimersByTimeAsync(60000);
    expect(await getPage("a")).toBeDefined();
    expect(await getPage("c")).toBeDefined();
  });

  it("a finalized deletion stays deleted after reopening the document", async () => {
    const doc = await seedDoc(["a", "b", "c"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    const next = pd.softDelete(doc.pageIds, "a");
    await putDoc({ ...doc, pageIds: next });
    await vi.advanceTimersByTimeAsync(6000);
    pd.dispose();

    const reopened = (await getDoc(doc.id))!;
    expect((await getPages(reopened)).map((p) => p.id)).toEqual(["b", "c"]);
  });

  it("keeps pageIds and page records consistent, with no orphans or missing references", async () => {
    const doc = await seedDoc(["a", "b", "c", "d"]);
    fakeTimers();
    const pd = new PendingDeletes(6000);
    let order = pd.softDelete(doc.pageIds, "b");
    order = pd.softDelete(order, "d");
    const undone = pd.undo(order, "b")!;
    await putDoc({ ...doc, pageIds: undone });
    await vi.advanceTimersByTimeAsync(10000);
    pd.dispose();

    const finalDoc = (await getDoc(doc.id))!;
    const pages = await getPages(finalDoc);
    // Every listed id resolves to a record, and no extra records linger.
    expect(pages.map((p) => p.id)).toEqual(finalDoc.pageIds);
    expect(finalDoc.pageIds).toEqual(["a", "b", "c"]);
    expect(await getPage("d")).toBeUndefined();
    expect(new Set(finalDoc.pageIds).size).toBe(finalDoc.pageIds.length);
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
