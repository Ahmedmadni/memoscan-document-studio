// Regression test: the exported PDF's embedded page images must follow the
// document's page order — including after reordering and after delete+undo.
// Each fixture JPEG carries a COM marker ("PAGE_A"…) that jsPDF embeds
// verbatim, so scanning the PDF bytes proves the real exported sequence.
import { describe, expect, it, vi } from "vitest";
import type { PageRecord } from "@/lib/db";
import { reorderPages, reinsertAt, removeId } from "@/lib/docOps";
import { defaultSettings } from "@/lib/imaging";
import { exportPdf } from "@/lib/pdf";
import { PAGE_A_JPEG, PAGE_B_JPEG, PAGE_C_JPEG } from "./fixtures";

const URLS: Record<string, string> = {
  PAGE_A: PAGE_A_JPEG,
  PAGE_B: PAGE_B_JPEG,
  PAGE_C: PAGE_C_JPEG,
};

vi.mock("@/lib/imaging", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imaging")>();
  return {
    ...actual,
    loadImageCanvas: async (blob: Blob) => {
      const key = blob.type.toUpperCase();
      return { width: 40, height: 60, toDataURL: () => URLS[key] };
    },
  };
});

function page(id: string): PageRecord {
  return {
    id,
    docId: "doc",
    original: new Blob([id]),
    processed: new Blob([id], { type: id }), // the mock maps this marker to its JPEG
    thumb: "",
    width: 40,
    height: 60,
    settings: defaultSettings(),
    autoDetected: false,
    createdAt: 0,
  };
}

async function pdfBytes(ids: string[]): Promise<Uint8Array> {
  const blob = await exportPdf(ids.map(page), { quality: "medium", pageSize: "fit" });
  return new Uint8Array(await blob.arrayBuffer());
}

function markerPositions(bytes: Uint8Array) {
  const text = new TextDecoder("latin1").decode(bytes);
  const at = (m: string) => {
    const i = text.indexOf(m);
    expect(i, `marker ${m} missing from PDF`).toBeGreaterThan(-1);
    return i;
  };
  return { a: at("PAGE_A"), b: at("PAGE_B"), c: at("PAGE_C") };
}

describe("exported PDF page order", () => {
  it("exports three pages in document order A, B, C", async () => {
    const bytes = await pdfBytes(["PAGE_A", "PAGE_B", "PAGE_C"]);
    const { a, b, c } = markerPositions(bytes);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // Exactly three embedded images, one per page.
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.split("/Subtype /Image").length - 1).toBe(3);
  });

  it("follows the reordered sequence C, A, B", async () => {
    const ids = reorderPages(["PAGE_A", "PAGE_B", "PAGE_C"], 2, 0);
    expect(ids).toEqual(["PAGE_C", "PAGE_A", "PAGE_B"]);
    const { a, b, c } = markerPositions(await pdfBytes(ids));
    expect(c).toBeLessThan(a);
    expect(a).toBeLessThan(b);
  });

  it("restores a deleted-then-undone page at its position in the export", async () => {
    // Delete B, then undo: it must come back between A and C in the PDF.
    const afterDelete = removeId(["PAGE_A", "PAGE_B", "PAGE_C"], "PAGE_B");
    const restored = reinsertAt(afterDelete, 1, "PAGE_B");
    const { a, b, c } = markerPositions(await pdfBytes(restored));
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});
