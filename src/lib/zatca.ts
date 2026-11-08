// Saudi ZATCA (Fatoora) TLV Base64 QR Code decoder & encoder + financial metadata helper.
// Runs 100% locally in the browser with zero external network calls.

export interface ZatcaInvoiceData {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  totalWithVat: string;
  vatAmount: string;
}

function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/** Encode ZATCA 5-tag TLV payload into Base64 for Saudi e-Invoicing QR codes. */
export function encodeZatcaTlvBase64(data: ZatcaInvoiceData): string {
  const fields: [number, string][] = [
    [1, data.sellerName.trim()],
    [2, data.vatNumber.trim()],
    [3, data.timestamp.trim()],
    [4, data.totalWithVat.trim()],
    [5, data.vatAmount.trim()],
  ];
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  for (const [tag, value] of fields) {
    const valBytes = encodeUtf8(value);
    const len = Math.min(255, valBytes.length);
    const chunk = new Uint8Array(2 + len);
    chunk[0] = tag;
    chunk[1] = len;
    chunk.set(valBytes.subarray(0, len), 2);
    chunks.push(chunk);
    totalLen += chunk.length;
  }
  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  let bin = "";
  for (let i = 0; i < merged.length; i++) bin += String.fromCharCode(merged[i]!);
  return btoa(bin);
}

/** Decode a ZATCA Base64 TLV string into structured Saudi tax invoice fields. */
export function decodeZatcaTlvBase64(base64Str: string): ZatcaInvoiceData | null {
  try {
    const clean = base64Str.trim();
    if (!clean) return null;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const tags: Record<number, string> = {};
    let idx = 0;
    while (idx + 2 <= bytes.length) {
      const tag = bytes[idx]!;
      const len = bytes[idx + 1]!;
      idx += 2;
      if (idx + len > bytes.length) break;
      tags[tag] = decodeUtf8(bytes.subarray(idx, idx + len));
      idx += len;
    }
    if (!tags[1] && !tags[2]) return null;
    return {
      sellerName: tags[1] ?? "",
      vatNumber: tags[2] ?? "",
      timestamp: tags[3] ?? "",
      totalWithVat: tags[4] ?? "",
      vatAmount: tags[5] ?? "",
    };
  } catch {
    return null;
  }
}

/** Format decoded ZATCA invoice data into searchable Arabic/English accounting notes. */
export function formatZatcaSummary(data: ZatcaInvoiceData, lang: "ar" | "en" = "ar"): string {
  if (lang === "en") {
    return [
      `[ZATCA Tax Invoice]`,
      `Seller: ${data.sellerName}`,
      `VAT Reg #: ${data.vatNumber}`,
      `Date: ${data.timestamp}`,
      `Total (incl. VAT): ${data.totalWithVat} SAR`,
      `VAT (15%): ${data.vatAmount} SAR`,
    ].join("\n");
  }
  return [
    `[بيانات الفاتورة الضريبية المبسطة - ZATCA]`,
    `المورد / المنشأة: ${data.sellerName}`,
    `الرقم الضريبي: ${data.vatNumber}`,
    `التاريخ والوقت: ${data.timestamp}`,
    `الإجمالي شامل الضريبة: ${data.totalWithVat} ريال`,
    `مبلغ ضريبة القيمة المضافة (15%): ${data.vatAmount} ريال`,
  ].join("\n");
}
