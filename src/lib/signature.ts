import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { removeSignatureBackground } from "./imaging";

export type Placement = { x: number; y: number; width: number };
export type PageGeometry = {
  width: number;
  height: number;
  x: number;
  y: number;
  rotation: number;
};
export type SignatureImage = { data: string; aspect: number };
export type StampPreset = "approved" | "certified" | "confidential" | "reviewed";
export type SavedSignatureItem = {
  id: string;
  label: string;
  image: SignatureImage;
  createdAt: number;
};
export type PinnedOverlay = {
  id: string;
  signature: SignatureImage;
  pageIndex: number;
  placement: Placement;
  opacity?: number | undefined;
};

export const INITIAL_PLACEMENT: Placement = { x: 0.62, y: 0.72, width: 0.23 };
const VAULT_KEY = "waraqah.signatures.v1";

/** Compute SHA-256 hex digest of original PDF bytes using Web Crypto API (with pure JS fallback). */
export async function computePdfSha256(bytes: Uint8Array): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle?.digest) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const buf = await crypto.subtle.digest("SHA-256", copy.buffer);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    // fallback below
  }
  let h1 = 0xdeadbeef ^ bytes.length;
  let h2 = 0x41c6ce57 ^ bytes.length;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i]!;
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export function displaySize(page: PageGeometry) {
  return page.rotation % 180 === 0
    ? { width: page.width, height: page.height }
    : { width: page.height, height: page.width };
}

/** All fractions are measured in the visible, rotated crop box, from its top left. */
export function clampPlacement(p: Placement, aspect: number, page: PageGeometry): Placement {
  const size = displaySize(page);
  const maxWidth = Math.min(0.5, size.height / (size.width * aspect));
  const width = Math.max(0.001, Math.min(p.width, maxWidth));
  const height = (width * size.width * aspect) / size.height;
  return {
    width,
    x: Math.max(0, Math.min(1 - width, p.x)),
    y: Math.max(0, Math.min(1 - height, p.y)),
  };
}

export function imageFormat(type: string) {
  if (type === "image/png") return "png";
  if (type === "image/jpeg") return "jpeg";
  throw new Error("SIGNATURE_FORMAT");
}

/** Transparent or uniform white images contain no visible signature ink. */
export function hasSignatureInk(data: ArrayLike<number>) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 16 && Math.min(data[i], data[i + 1], data[i + 2]) < 245) return true;
  }
  return false;
}

export async function loadSigningPdf(bytes: Uint8Array) {
  try {
    const pdf = await PDFDocument.load(bytes.slice(), { ignoreEncryption: false });
    if (!pdf.getPageCount()) throw new Error("EMPTY_PDF");
    return pdf.getPages().map((page): PageGeometry => ({
      ...page.getCropBox(),
      rotation: ((page.getRotation().angle % 360) + 360) % 360,
    }));
  } catch {
    throw new Error("INVALID_PDF");
  }
}

export function pdfImagePlacement(p: Placement, aspect: number, page: PageGeometry) {
  const safe = clampPlacement(p, aspect, page);
  const size = displaySize(page);
  const dx = safe.x * size.width;
  const dy = safe.y * size.height;
  const width = safe.width * size.width;
  const height = width * aspect;
  let x = dx,
    y = page.height - dy - height;
  if (page.rotation === 90) {
    x = dy + height;
    y = dx;
  }
  if (page.rotation === 180) {
    x = page.width - dx;
    y = dy + height;
  }
  if (page.rotation === 270) {
    x = page.width - dy - height;
    y = page.height - dx;
  }
  return { x: x + page.x, y: y + page.y, width, height, rotate: degrees(page.rotation) };
}

export async function createSignedPdf(
  bytes: Uint8Array,
  signature: SignatureImage | null,
  pageIndex: number,
  placement: Placement,
  applyToAllPages = false,
  watermarkText = "",
  opacity = 1,
  pinnedOverlays: PinnedOverlay[] = [],
  includeAuditFooter = false,
) {
  if (!signature && !pinnedOverlays.length) throw new Error("BLANK_SIGNATURE");
  const pages = await loadSigningPdf(bytes);
  const geometry = pages[pageIndex];
  if (!geometry) throw new Error("INVALID_PAGE");
  const sourceHash = includeAuditFooter ? await computePdfSha256(bytes) : "";
  const pdf = await PDFDocument.load(bytes.slice());

  // 1. Draw any previously pinned overlays first
  for (const item of pinnedOverlays) {
    const itemGeo = pages[item.pageIndex];
    if (!itemGeo) continue;
    const fmt = imageFormat(item.signature.data.slice(5, item.signature.data.indexOf(";")));
    const emb =
      fmt === "png"
        ? await pdf.embedPng(item.signature.data)
        : await pdf.embedJpg(item.signature.data);
    const clamped = clampPlacement(item.placement, emb.height / emb.width, itemGeo);
    const drawOpts = pdfImagePlacement(clamped, emb.height / emb.width, itemGeo);
    pdf.getPage(item.pageIndex).drawImage(emb, {
      ...drawOpts,
      ...(item.opacity !== undefined && item.opacity < 1 ? { opacity: item.opacity } : {}),
    });
  }

  // 2. Draw active signature overlay
  if (signature) {
    const format = imageFormat(signature.data.slice(5, signature.data.indexOf(";")));
    const image =
      format === "png" ? await pdf.embedPng(signature.data) : await pdf.embedJpg(signature.data);
    const targets = applyToAllPages ? pages.map((_, index) => index) : [pageIndex];
    for (const index of targets) {
      const targetGeometry = pages[index];
      const targetPlacement = clampPlacement(placement, image.height / image.width, targetGeometry);
      const drawOpts = pdfImagePlacement(
        targetPlacement,
        image.height / image.width,
        targetGeometry,
      );
      pdf.getPage(index).drawImage(image, {
        ...drawOpts,
        ...(opacity < 1 ? { opacity } : {}),
      });
    }
  }

  const cleanWatermark = watermarkText.trim();
  if (cleanWatermark) {
    const asciiSafe = /^[\x20-\x7E]+$/.test(cleanWatermark);
    if (asciiSafe) {
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (let i = 0; i < pages.length; i++) {
        const p = pdf.getPage(i);
        const { width, height } = p.getSize();
        p.drawText(cleanWatermark.slice(0, 48), {
          x: width * 0.18,
          y: height * 0.45,
          size: Math.max(18, Math.min(36, Math.round(width * 0.045))),
          font,
          color: rgb(0.55, 0.58, 0.62),
          opacity: 0.2,
          rotate: degrees(32),
        });
      }
    } else if (typeof document !== "undefined") {
      const wmPng = renderWatermarkPng(cleanWatermark);
      if (wmPng) {
        const wmImage = await pdf.embedPng(wmPng);
        for (let i = 0; i < pages.length; i++) {
          const p = pdf.getPage(i);
          const { width, height } = p.getSize();
          const w = width * 0.65;
          const h = (w * wmImage.height) / wmImage.width;
          p.drawImage(wmImage, {
            x: (width - w) / 2,
            y: (height - h) / 2,
            width: w,
            height: h,
            opacity: 0.22,
          });
        }
      }
    }
  }

  // 3. Optional SHA-256 Audit Footer on signed pages
  if (includeAuditFooter && sourceHash) {
    const auditFont = await pdf.embedFont(StandardFonts.Courier);
    const stampIso = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
    const auditLine = `Waraqah Audit | SHA-256: ${sourceHash.slice(0, 24)}... | Signed: ${stampIso}`;
    for (let i = 0; i < pages.length; i++) {
      const p = pdf.getPage(i);
      const { width } = p.getSize();
      p.drawText(auditLine, {
        x: Math.max(16, width * 0.04),
        y: 10,
        size: 7.5,
        font: auditFont,
        color: rgb(0.32, 0.38, 0.44),
        opacity: 0.85,
      });
    }
  }

  return pdf.save();
}

function renderWatermarkPng(text: string): string | null {
  try {
    const c = document.createElement("canvas");
    c.width = 720;
    c.height = 360;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((-28 * Math.PI) / 180);
    ctx.font = "700 38px system-ui, sans-serif";
    ctx.fillStyle = "#475569";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.slice(0, 48), 0, 0);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function readSignatureImage(
  file: File,
  autoRemovePaperBg = false,
): Promise<SignatureImage> {
  imageFormat(file.type);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("SIGNATURE_READ"));
    reader.onerror = () => reject(new Error("SIGNATURE_READ"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("SIGNATURE_READ"));
    image.src = data;
  });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("SIGNATURE_READ");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  if (autoRemovePaperBg) {
    removeSignatureBackground(imgData, 212);
    ctx.putImageData(imgData, 0, 0);
  }
  if (!hasSignatureInk(imgData.data)) throw new Error("BLANK_SIGNATURE");
  const outData = autoRemovePaperBg ? canvas.toDataURL("image/png") : data;
  return { data: outData, aspect: image.naturalHeight / image.naturalWidth };
}

export function createOfficialStamp(
  preset: StampPreset,
  holder = "Waraqah Studio",
  color = "#142b55",
): SignatureImage {
  const c = document.createElement("canvas");
  c.width = 520;
  c.height = 220;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("SIGNATURE_READ");
  const labels: Record<StampPreset, { ar: string; en: string }> = {
    approved: { ar: "معتمد رسميًا", en: "APPROVED" },
    certified: { ar: "نسخة طبق الأصل", en: "CERTIFIED COPY" },
    confidential: { ar: "سري للغاية", en: "CONFIDENTIAL" },
    reviewed: { ar: "تمت المراجعة والتدقيق", en: "REVIEWED" },
  };
  const info = labels[preset];
  const dateStr = new Date().toISOString().slice(0, 10);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, c.width - 28, c.height - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, c.width - 48, c.height - 48);
  ctx.textAlign = "center";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText(info.ar, c.width / 2, 74);
  ctx.font = "700 22px system-ui, sans-serif";
  ctx.fillText(info.en, c.width / 2, 110);
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText((holder.trim() || "Waraqah").slice(0, 32), c.width / 2, 148);
  ctx.font = "500 16px monospace";
  ctx.fillText(dateStr, c.width / 2, 182);
  return { data: c.toDataURL("image/png"), aspect: c.height / c.width };
}

export function createDateStampImage(color = "#142b55"): SignatureImage {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 120;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("SIGNATURE_READ");
  const dateStr = new Date().toISOString().slice(0, 10);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.textAlign = "center";
  ctx.font = "700 28px monospace";
  ctx.fillText(`DATE: ${dateStr}`, c.width / 2, 70);
  return { data: c.toDataURL("image/png"), aspect: c.height / c.width };
}

export function listSavedSignatures(): SavedSignatureItem[] {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSignatureItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSignatureToVault(label: string, image: SignatureImage): SavedSignatureItem[] {
  const next: SavedSignatureItem[] = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      image,
      createdAt: Date.now(),
    },
    ...listSavedSignatures(),
  ].slice(0, 8);
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function removeSavedSignature(id: string): SavedSignatureItem[] {
  const next = listSavedSignatures().filter((item) => item.id !== id);
  try {
    localStorage.setItem(VAULT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
