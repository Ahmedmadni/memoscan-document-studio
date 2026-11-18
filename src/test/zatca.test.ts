import { describe, expect, it } from "vitest";
import {
  checkInvoiceConsistency,
  decodeZatcaTlvBase64,
  encodeZatcaTlvBase64,
  formatZatcaSummary,
} from "@/lib/zatca";

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

describe("invoice data checks", () => {
  const invoice = {
    sellerName: "مورد",
    vatNumber: "300123456700003",
    timestamp: "2026-11-06T12:30:00Z",
    totalWithVat: "100.00",
    vatAmount: "15.00",
  };
  it.each(["2026-02-30T12:30:00Z", "2026-02-29T12:30:00Z", "2026-04-31T12:30:00+03:00"])(
    "rejects an impossible calendar date %s",
    (timestamp) => {
      expect(decodeZatcaTlvBase64(encodeZatcaTlvBase64({ ...invoice, timestamp }))).toBeNull();
    },
  );
  it("accepts a real leap day with timezone and checks exact decimal amounts", () => {
    expect(
      decodeZatcaTlvBase64(
        encodeZatcaTlvBase64({ ...invoice, timestamp: "2024-02-29T23:59:59+03:00" }),
      ),
    ).not.toBeNull();
    expect(
      checkInvoiceConsistency({
        ...invoice,
        totalWithVat: "9007199254740992.10",
        vatAmount: "9007199254740992.11",
      }),
    ).toEqual(["invoiceVatExceedsTotal"]);
    expect(checkInvoiceConsistency({ ...invoice, vatAmount: "-15" })).toEqual([
      "invoiceSignsMismatch",
    ]);
  });
  it("allows consistent negative notes, zero tax and differing tax rates", () => {
    expect(checkInvoiceConsistency({ ...invoice, totalWithVat: "-100", vatAmount: "-15" })).toEqual(
      [],
    );
    expect(checkInvoiceConsistency({ ...invoice, vatAmount: "0" })).toEqual([]);
    expect(checkInvoiceConsistency({ ...invoice, vatAmount: "5" })).toEqual([]);
  });
});

it("requires all five basic fields and rejects truncated or repeated tags", () => {
  const encoded = encodeZatcaTlvBase64({
    sellerName: "Test seller",
    vatNumber: "300123456700003",
    timestamp: "2026-11-06T12:30:00Z",
    totalWithVat: "115.00",
    vatAmount: "15.00",
  });
  const bytes = atob(encoded);
  expect(decodeZatcaTlvBase64(btoa(bytes.slice(0, -1)))).toBeNull();
  expect(decodeZatcaTlvBase64(btoa(bytes + bytes))).toBeNull();
  expect(decodeZatcaTlvBase64(btoa(bytes + "\x06\x02\xff\xfe"))).toEqual(
    decodeZatcaTlvBase64(encoded),
  );
});
