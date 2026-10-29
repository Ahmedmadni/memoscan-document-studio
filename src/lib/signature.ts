import { degrees, PDFDocument } from "pdf-lib";

export type Placement = { x: number; y: number; width: number };
export type PageGeometry = { width: number; height: number; x: number; y: number; rotation: number };
export type SignatureImage = { data: string; aspect: number };
export const INITIAL_PLACEMENT: Placement = { x: 0.62, y: 0.72, width: 0.23 };

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
  const height = width * size.width * aspect / size.height;
  return { width, x: Math.max(0, Math.min(1 - width, p.x)), y: Math.max(0, Math.min(1 - height, p.y)) };
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
      ...page.getCropBox(), rotation: ((page.getRotation().angle % 360) + 360) % 360,
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
  let x = dx, y = page.height - dy - height;
  if (page.rotation === 90) { x = dy + height; y = dx; }
  if (page.rotation === 180) { x = page.width - dx; y = dy + height; }
  if (page.rotation === 270) { x = page.width - dy - height; y = page.height - dx; }
  return { x: x + page.x, y: y + page.y, width, height, rotate: degrees(page.rotation) };
}

export async function createSignedPdf(bytes: Uint8Array, signature: SignatureImage | null, pageIndex: number, placement: Placement) {
  if (!signature) throw new Error("BLANK_SIGNATURE");
  const format = imageFormat(signature.data.slice(5, signature.data.indexOf(";")));
  const pages = await loadSigningPdf(bytes);
  const geometry = pages[pageIndex];
  if (!geometry) throw new Error("INVALID_PAGE");
  const pdf = await PDFDocument.load(bytes.slice());
  const image = format === "png" ? await pdf.embedPng(signature.data) : await pdf.embedJpg(signature.data);
  pdf.getPage(pageIndex).drawImage(image, pdfImagePlacement(placement, image.height / image.width, geometry));
  return pdf.save();
}

export async function readSignatureImage(file: File): Promise<SignatureImage> {
  imageFormat(file.type);
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("SIGNATURE_READ"));
    reader.onerror = () => reject(new Error("SIGNATURE_READ"));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("SIGNATURE_READ")); image.src = data; });
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1800 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("SIGNATURE_READ");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!hasSignatureInk(ctx.getImageData(0, 0, canvas.width, canvas.height).data)) throw new Error("BLANK_SIGNATURE");
  return { data, aspect: image.naturalHeight / image.naturalWidth };
}
