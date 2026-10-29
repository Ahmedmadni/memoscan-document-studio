import { describe, expect, it } from "vitest";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream, degrees } from "pdf-lib";
import {
  clampPlacement,
  createSignedPdf,
  hasSignatureInk,
  imageFormat,
  loadSigningPdf,
  pdfImagePlacement,
} from "@/lib/signature";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHgAAAAoCAYAAAA16j4lAAABpUlEQVR4nO2bwbGDMAxEzZ+0QBFUQs2pJEWkCOek+Q6IYGPJlsW+C8fIfqykQ5hijAH45a93AUAXCHYOBDtHXfC8rDF9grZMmksWJ/X9ek5qPwh2qCX4KLFIclswg52jInib0m1bRorbIS74SB4ky5J7f6KCS5cqSC5nXtZYcm9iW3SuXGzW5eR2RQ41waXJheQ9NWKJh0YhZwW8X88J7ZlHQmpKdYJr0lj6YnhGWixRJVii1d5dsva4utyitQqblzV6l6yVVo7LCZZM3l2WrpZiiUuCNdqqV8k9pKYUt2it7dfbZt1bLFGU4BYpG33pstaJsgW3LHw0yVbSynF5i25ZvNXN2rJYIivBPRJlrdURI0hNORXc86ItSR5NLPGzRfe+YAubde87qOUwwZYO1npEjJpWjmzBvQ/Xoh5PYgm2RVuTyyG1WXuUmrJLsKXWvEWyNu9iCbZFp4e3duBayZZfYA1+zmCrBy8dIXdJK4fqpyua5Ei+s1hiWMEh8JIh9RuRP91Z4W7zNYehExwCpJ4xvOAQ/iVD7B4XgsEx+HzUORDsnA8H7nU+Cq+o/wAAAABJRU5ErkJggg==";
const jpeg =
  "data:image/jpeg;base64,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";
const portrait = { x: 0, y: 0, width: 600, height: 800, rotation: 0 };
async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([600, 800]);
  pdf.addPage([800, 400]);
  return pdf.save();
}
describe("signature rules", () => {
  it("loads real PDF page dimensions and rejects corrupt input recoverably", async () => {
    expect(await loadSigningPdf(await fixture())).toEqual([
      portrait,
      { ...portrait, width: 800, height: 400 },
    ]);
    await expect(loadSigningPdf(new Uint8Array([1, 2, 3]))).rejects.toThrow("INVALID_PDF");
    expect(await loadSigningPdf(await fixture())).toHaveLength(2);
  });
  it("accepts only PNG and JPEG", () => {
    expect(imageFormat("image/png")).toBe("png");
    expect(imageFormat("image/jpeg")).toBe("jpeg");
    expect(() => imageFormat("image/webp")).toThrow("SIGNATURE_FORMAT");
    expect(() => imageFormat("image/svg+xml")).toThrow("SIGNATURE_FORMAT");
  });
  it("rejects transparent and white signatures, accepts visible ink", async () => {
    expect(hasSignatureInk([0, 0, 0, 0, 255, 255, 255, 255])).toBe(false);
    expect(hasSignatureInk([20, 40, 70, 255])).toBe(true);
    await expect(
      createSignedPdf(await fixture(), null, 0, { x: 0, y: 0, width: 0.2 }),
    ).rejects.toThrow("BLANK_SIGNATURE");
  });
  it.each([0.05, 0.5, 5, 50])("keeps aspect %s entirely in both page orientations", (aspect) => {
    for (const page of [portrait, { ...portrait, width: 800, height: 400 }]) {
      const p = clampPlacement({ x: 0.95, y: 0.99, width: 0.5 }, aspect, page);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.width).toBeLessThanOrEqual(1.00000001);
      expect(p.y + (p.width * page.width * aspect) / page.height).toBeLessThanOrEqual(1.00000001);
    }
  });
  it("recalculates after changing page or PDF without relying on canvas loading", () => {
    const p = { x: 0.62, y: 0.72, width: 0.23 };
    expect(clampPlacement(p, 5, portrait)).toEqual({
      x: 0.62,
      y: 0.13749999999999996,
      width: 0.23,
    });
    const q = clampPlacement(p, 5, { ...portrait, width: 800, height: 400 });
    expect(q.width).toBe(0.1);
    expect(q.y).toBe(0);
    expect(clampPlacement(p, 0.2, portrait)).toEqual(p);
  });
  it("converts top-left to PDF bottom-left with exact size", () => {
    const result = pdfImagePlacement({ x: 0.2, y: 0.3, width: 0.25 }, 0.5, portrait);
    expect(result).toMatchObject({ x: 120, y: 485, width: 150, height: 75 });
  });
  it.each([0, 90, 180, 270])("accounts for crop box and rotation %s", (rotation) => {
    const page = { ...portrait, x: 10, y: 20, rotation };
    const result = pdfImagePlacement({ x: 0.2, y: 0.3, width: 0.25 }, 0.5, page);
    const expected =
      rotation === 0
        ? [130, 505, 150, 75]
        : rotation === 90
          ? [290, 180, 200, 100]
          : rotation === 180
            ? [490, 335, 150, 75]
            : [330, 660, 200, 100];
    expect([result.x, result.y, result.width, result.height]).toEqual(expected);
    expect(result.rotate.angle).toBe(rotation);
  });
  it.each([png, jpeg])(
    "exports a real PDF only signing selected page and preserving original",
    async (data) => {
      const original = await fixture();
      const copy = original.slice();
      const output = await createSignedPdf(original, { data, aspect: 1 / 3 }, 1, {
        x: 0.2,
        y: 0.3,
        width: 0.25,
      });
      const parsed = await PDFDocument.load(output);
      expect(parsed.getPageCount()).toBe(2);
      expect(original).toEqual(copy);
      expect(parsed.getPage(0).node.Contents()).toBeUndefined();
      const page = parsed.getPage(1);
      const contents = page.node.Contents();
      expect(contents).toBeDefined();
      const resources = page.node.Resources();
      expect(resources?.lookup(PDFName.of("XObject")).toString()).toContain("Image");
      const refs = contents && "asArray" in contents ? contents.asArray() : [contents];
      const decoded = refs
        .map((ref) => {
          const stream = parsed.context.lookup(ref);
          return stream instanceof PDFRawStream
            ? new TextDecoder().decode(decodePDFRawStream(stream).decode())
            : "";
        })
        .join("");
      expect(decoded).toMatch(/1 0 0 1 160 213\.3333333333333\d cm/);
      expect(decoded).toContain("200 0 0 66.66666666666666 0 0 cm");
    },
  );
  it("loads rotated different-size pages", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([800, 400]);
    page.setRotation(degrees(90));
    page.setCropBox(20, 30, 700, 300);
    expect(await loadSigningPdf(await pdf.save())).toEqual([
      { x: 20, y: 30, width: 700, height: 300, rotation: 90 },
    ]);
  });
});
