import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  createDoc,
  deleteDoc,
  getDoc,
  getPages,
  listDocs,
  putDoc,
  putPage,
  type PageRecord,
} from "@/lib/db";
import { insertAfter, movePage, removeId } from "@/lib/docOps";
import {
  applyAdjustments,
  buildLut,
  defaultSettings,
  detectFromGray,
  isConvexQuad,
  quadArea,
  solveHomography,
  type Corners,
} from "@/lib/imaging";

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

describe("page order helpers", () => {
  it("moves a page later and earlier", () => {
    expect(movePage(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(movePage(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });
  it("ignores moves past either end", () => {
    expect(movePage(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(movePage(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
  it("duplicates right after the source and removes by id", () => {
    expect(insertAfter(["a", "b"], 0, "a2")).toEqual(["a", "a2", "b"]);
    expect(removeId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
});

describe("IndexedDB persistence", () => {
  it("saves a document, keeps page order on reopen, and deletes pages with the document", async () => {
    const doc = await createDoc("Invoice");
    for (const id of ["p1", "p2", "p3"]) await putPage(page(id, doc.id));
    await putDoc({ ...doc, pageIds: ["p3", "p1", "p2"] });
    const reopened = (await getDoc(doc.id))!;
    expect((await getPages(reopened)).map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
    await deleteDoc(doc.id);
    expect(await getDoc(doc.id)).toBeUndefined();
    expect((await listDocs()).find((d) => d.id === doc.id)).toBeUndefined();
  });
  it("skips missing page records instead of failing", async () => {
    const doc = await createDoc("Broken");
    await putPage(page("ok", doc.id));
    const pages = await getPages({ ...doc, pageIds: ["ok", "gone"] });
    expect(pages.map((p) => p.id)).toEqual(["ok"]);
  });
});

function synth(w: number, h: number, bg: number, fg: number, quad: [number, number][]) {
  const g = new Uint8Array(w * h).fill(bg);
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const [xi, yi] = quad[i]!;
      const [xj, yj] = quad[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) g[y * w + x] = fg;
  return g;
}

describe("edge detection", () => {
  const quad: [number, number][] = [
    [60, 30],
    [250, 50],
    [235, 210],
    [45, 195],
  ];
  it("finds a tilted light page on a dark background", () => {
    const r = detectFromGray(synth(300, 240, 50, 230, quad), 300, 240);
    expect(r.detected).toBe(true);
    expect(r.corners[0].x).toBeCloseTo(60 / 299, 1);
    expect(r.corners[2].y).toBeCloseTo(210 / 239, 1);
  });
  it("finds a darker page on a lighter background via edges", () => {
    const r = detectFromGray(synth(300, 240, 200, 150, quad), 300, 240);
    expect(r.detected).toBe(true);
    expect(r.method).toBe("edges");
  });
  it("reports failure on a featureless image", () => {
    const r = detectFromGray(new Uint8Array(300 * 240).fill(128), 300, 240);
    expect(r.detected).toBe(false);
    expect(quadArea(r.corners)).toBeCloseTo(1, 5);
  });
});

describe("geometry edge cases", () => {
  it("throws on degenerate (collinear) corners", () => {
    const rect = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const line = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => solveHomography(rect, line)).toThrow();
  });
  it("rejects a near-degenerate quad", () => {
    const c: Corners = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(isConvexQuad(c)).toBe(false);
  });
});

describe("filters", () => {
  const img = (vals: number[]) => {
    const data = new Uint8ClampedArray(vals.length * 4);
    vals.forEach((v, i) => data.set([v, v / 2, 255 - v, 255], i * 4));
    return { width: vals.length, height: 1, data, colorSpace: "srgb" } as ImageData;
  };
  it("brightness +50 lifts mid-gray by 64 levels", () => {
    expect(buildLut(50, 0)[100]).toBe(164);
  });
  it("grayscale makes all channels equal", () => {
    const i = img([10, 200]);
    applyAdjustments(i, { ...defaultSettings(), filter: "gray", sharpen: 0 });
    expect(i.data[0]).toBe(i.data[1]);
    expect(i.data[1]).toBe(i.data[2]);
  });
  it("black & white output is strictly 0 or 255", () => {
    const i = img(Array.from({ length: 64 }, (_, k) => (k % 8 < 2 ? 20 : 220)));
    applyAdjustments(i, { ...defaultSettings(), filter: "bw" });
    for (let k = 0; k < i.data.length; k += 4) expect([0, 255]).toContain(i.data[k]);
  });
});
