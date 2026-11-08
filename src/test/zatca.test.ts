import { describe, expect, it } from "vitest";
import { decodeZatcaTlvBase64, encodeZatcaTlvBase64, formatZatcaSummary } from "@/lib/zatca";

describe("Saudi ZATCA TLV Base64 e-invoice helper", () => {
  it("encodes and decodes Arabic seller name, 15-digit VAT number, timestamp, total, and 15% VAT", () => {
    const sample = {
      sellerName: "مكتب أحمد المدني للاستشارات المالية",
      vatNumber: "300123456700003",
      timestamp: "2026-11-06T12:30:00Z",
      totalWithVat: "11500.00",
      vatAmount: "1500.00",
    };
    const b64 = encodeZatcaTlvBase64(sample);
    const decoded = decodeZatcaTlvBase64(b64);
    expect(decoded).toEqual(sample);
    expect(formatZatcaSummary(decoded!, "ar")).toContain("300123456700003");
    expect(formatZatcaSummary(decoded!, "en")).toContain("11500.00 SAR");
  });

  it("returns null for malformed or non-TLV Base64 strings", () => {
    expect(decodeZatcaTlvBase64("")).toBeNull();
    expect(decodeZatcaTlvBase64("not-valid-base64!!!")).toBeNull();
  });
});
