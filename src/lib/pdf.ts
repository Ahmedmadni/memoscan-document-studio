import { jsPDF } from "jspdf";
import type { PageRecord } from "./db";
import { composeIdCardSheet, loadImageCanvas } from "./imaging";
import { isNative } from "./native";

export type PdfQuality = "high" | "medium" | "small";
export type PdfPageSize = "fit" | "a4";
export type PdfLayoutMode = "standard" | "id-card";

export const QUALITY_PRESETS: Record<PdfQuality, { maxDim: number; jpeg: number }> = {
  high: { maxDim: 2400, jpeg: 0.9 },
  medium: { maxDim: 1600, jpeg: 0.75 },
  small: { maxDim: 1100, jpeg: 0.55 },
};

let pendingSignPayload: { name: string; bytes: Uint8Array } | null = null;

export function setPendingSignPdf(name: string, bytes: Uint8Array) {
  pendingSignPayload = { name, bytes };
}

export function consumePendingSignPdf() {
  const item = pendingSignPayload;
  pendingSignPayload = null;
  return item;
}

export async function exportPdf(
  pages: PageRecord[],
  opts: {
    quality: PdfQuality;
    pageSize: PdfPageSize;
    layout?: PdfLayoutMode | undefined;
    pageNumbers?: boolean | undefined;
    watermarkText?: string | undefined;
  },
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (!pages.length) throw new Error("NO_PAGES");
  const preset = QUALITY_PRESETS[opts.quality];
  let pdf: jsPDF | null = null;

  if (opts.layout === "id-card") {
    const totalSheets = Math.ceil(pages.length / 2);
    for (let s = 0; s < totalSheets; s++) {
      const front = await loadImageCanvas(pages[s * 2]!.processed, preset.maxDim);
      const back = pages[s * 2 + 1]
        ? await loadImageCanvas(pages[s * 2 + 1]!.processed, preset.maxDim)
        : undefined;
      const sheet = composeIdCardSheet(front, back, preset.maxDim);
      const data = sheet.toDataURL("image/jpeg", preset.jpeg);
      const pw = 210;
      const ph = 297;
      if (!pdf)
        pdf = new jsPDF({ unit: "mm", format: [pw, ph], orientation: "portrait", compress: true });
      else pdf.addPage([pw, ph], "portrait");
      pdf.addImage(data, "JPEG", 0, 0, pw, ph, undefined, "FAST");
      if (opts.pageNumbers) {
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        pdf.text(`${s + 1} / ${totalSheets}`, pw / 2, ph - 6, { align: "center" });
      }
      onProgress?.(Math.min(pages.length, (s + 1) * 2), pages.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!pdf) throw new Error("NO_PAGES");
    return pdf.output("blob");
  }

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
    if (opts.watermarkText?.trim() && /^[\x20-\x7E]+$/.test(opts.watermarkText.trim())) {
      pdf.setFontSize(18);
      pdf.setTextColor(180, 185, 195);
      pdf.text(opts.watermarkText.trim().slice(0, 40), pw / 2, ph / 2, {
        align: "center",
        angle: 30,
      });
    }
    if (opts.pageNumbers) {
      pdf.setFontSize(9);
      pdf.setTextColor(110, 110, 110);
      pdf.text(`${i + 1} / ${pages.length}`, pw / 2, ph - 5, { align: "center" });
    }
    onProgress?.(i + 1, pages.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!pdf) throw new Error("NO_PAGES");
  return pdf.output("blob");
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
  if (isNative()) return true;
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([blob], filename, { type: blob.type })] });
  } catch {
    return false;
  }
}

/** Returns "shared" | "cancelled". Throws if sharing is unavailable. */
export async function shareFile(blob: Blob, filename: string) {
  if (isNative()) {
    const { savePdfNative, shareFileNative } = await import("./native");
    return shareFileNative(await savePdfNative(blob, filename), filename);
  }
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
  return (name.trim() || "Waraqah").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) + ".pdf";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
