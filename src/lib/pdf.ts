import { jsPDF } from "jspdf";
import type { PageRecord } from "./db";
import { loadImageCanvas } from "./imaging";

export type PdfQuality = "high" | "medium" | "small";
export type PdfPageSize = "fit" | "a4";

export const QUALITY_PRESETS: Record<PdfQuality, { maxDim: number; jpeg: number }> = {
  high: { maxDim: 2400, jpeg: 0.9 },
  medium: { maxDim: 1600, jpeg: 0.75 },
  small: { maxDim: 1100, jpeg: 0.55 },
};

export async function exportPdf(
  pages: PageRecord[],
  opts: { quality: PdfQuality; pageSize: PdfPageSize },
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (!pages.length) throw new Error("NO_PAGES");
  const preset = QUALITY_PRESETS[opts.quality];
  let pdf: jsPDF | null = null;
  for (let i = 0; i < pages.length; i++) {
    const c = await loadImageCanvas(pages[i].processed, preset.maxDim);
    const data = c.toDataURL("image/jpeg", preset.jpeg);
    const landscape = c.width > c.height;
    let pw: number, ph: number;
    if (opts.pageSize === "a4") {
      pw = landscape ? 297 : 210;
      ph = landscape ? 210 : 297;
    } else {
      pw = landscape ? 297 : 210;
      ph = (pw * c.height) / c.width;
    }
    const orientation = pw > ph ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ unit: "mm", format: [pw, ph], orientation, compress: true });
    else pdf.addPage([pw, ph], orientation);
    let iw = pw;
    let ih = ph;
    if (opts.pageSize === "a4") {
      const m = 8;
      const s = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height);
      iw = c.width * s;
      ih = c.height * s;
    }
    pdf.addImage(data, "JPEG", (pw - iw) / 2, (ph - ih) / 2, iw, ih, undefined, "FAST");
    onProgress?.(i + 1, pages.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return pdf!.output("blob");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function canShareFile(blob: Blob, filename: string) {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] });
  } catch {
    return false;
  }
}

/** Returns "shared" | "cancelled". Throws if sharing is unavailable. */
export async function shareFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  try {
    await navigator.share({ files: [file], title: filename });
    return "shared" as const;
  } catch (e) {
    if ((e as DOMException).name === "AbortError") return "cancelled" as const;
    throw e;
  }
}

export function safeFilename(name: string) {
  return (name.trim() || "MemoScan").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) + ".pdf";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
